#include "xs.h"
#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"

#include "esp_err.h"
#include "esp_idf_version.h"
#include "esp_mac.h"
#include "esp_now.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"

#if ESP_IDF_VERSION < ESP_IDF_VERSION_VAL(5, 0, 0)
#error "ESP-NOW module requires ESP-IDF 5.0 or newer"
#endif

#define ESPNOW_ID_BYTES 6
#define ESPNOW_ID_CHARS 12
#define ESPNOW_KEY_BYTES 16
#ifdef ESP_NOW_MAX_DATA_LEN_V2
#define ESPNOW_MAX_FRAME_BYTES ESP_NOW_MAX_DATA_LEN_V2
#else
#define ESPNOW_MAX_FRAME_BYTES ESP_NOW_MAX_DATA_LEN
#endif
#define ESPNOW_RECEIVE_HEADER_BYTES 16

typedef struct {
	xsMachine *the;
	xsSlot object;
	uint8_t id[ESPNOW_ID_BYTES];
	wifi_interface_t interface;
	uint8_t closed;
	uint32_t useCount;
	uint16_t receiveLimit;
	uint16_t receivePending;
	uint32_t receiveDropped;
	uint32_t sendNotificationsDropped;
} ESPNowRadioRecord, *ESPNowRadio;

static ESPNowRadio gESPNowRadio;
static portMUX_TYPE gESPNowRadioMux = portMUX_INITIALIZER_UNLOCKED;
static const uint8_t gBroadcastAddress[ESPNOW_ID_BYTES] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
static void espnowRelease(ESPNowRadio radio)
{
	if (0 == __atomic_sub_fetch(&radio->useCount, 1, __ATOMIC_SEQ_CST))
		c_free(radio);
}

static ESPNowRadio espnowAcquire(void)
{
	ESPNowRadio radio;
	portENTER_CRITICAL(&gESPNowRadioMux);
	radio = gESPNowRadio;
	if (radio && !radio->closed)
		__atomic_add_fetch(&radio->useCount, 1, __ATOMIC_SEQ_CST);
	else
		radio = NULL;
	portEXIT_CRITICAL(&gESPNowRadioMux);
	return radio;
}

// Credits cover both posted native messages and unread JavaScript packets.
static void espnowConsumeReceive(ESPNowRadio radio)
{
	portENTER_CRITICAL(&gESPNowRadioMux);
	if (radio->receivePending) radio->receivePending--;
	portEXIT_CRITICAL(&gESPNowRadioMux);
}

static uint8_t espnowHexNibble(char value)
{
	if ((value >= '0') && (value <= '9')) return (uint8_t)(value - '0');
	if ((value >= 'a') && (value <= 'f')) return (uint8_t)(value - 'a' + 10);
	if ((value >= 'A') && (value <= 'F')) return (uint8_t)(value - 'A' + 10);
	return 0xff;
}

static uint8_t espnowParseID(xsMachine *the, xsSlot slot, uint8_t *address)
{
	char id[ESPNOW_ID_CHARS + 1];
	xsmcToStringBuffer(slot, id, sizeof(id));
	if (c_strlen(id) != ESPNOW_ID_CHARS)
		return 0;
	for (uint8_t index = 0; index < ESPNOW_ID_BYTES; index++) {
		uint8_t high = espnowHexNibble(id[index * 2]);
		uint8_t low = espnowHexNibble(id[(index * 2) + 1]);
		if ((0xff == high) || (0xff == low))
			return 0;
		address[index] = (uint8_t)((high << 4) | low);
	}
	return 1;
}

static void espnowFormatID(const uint8_t *address, char *id)
{
	static const char hex[] = "0123456789ABCDEF";
	for (uint8_t index = 0; index < ESPNOW_ID_BYTES; index++) {
		id[index * 2] = hex[address[index] >> 4];
		id[(index * 2) + 1] = hex[address[index] & 0x0f];
	}
	id[ESPNOW_ID_CHARS] = 0;
}

static void espnowSetIDResult(xsMachine *the)
{
	uint8_t address[ESPNOW_ID_BYTES];
	char id[ESPNOW_ID_CHARS + 1];
	if (ESP_OK != esp_read_mac(address, ESP_MAC_WIFI_STA))
		xsUnknownError("read ESP-NOW identity failed");
	espnowFormatID(address, id);
	xsmcSetString(xsResult, id);
}

static void espnowThrowESPError(xsMachine *the, const char *operation, esp_err_t error)
{
	char message[96];
	c_snprintf(message, sizeof(message), "%s failed: %s", operation, esp_err_to_name(error));
	xsUnknownError(message);
}

static esp_err_t espnowAddOrUpdate(const uint8_t *address, wifi_interface_t interface,
	uint8_t channel, const uint8_t *lmk)
{
	esp_now_peer_info_t peer = {0};
	c_memcpy(peer.peer_addr, address, ESPNOW_ID_BYTES);
	peer.channel = channel;
	peer.ifidx = interface;
	peer.encrypt = NULL != lmk;
	if (lmk) c_memcpy(peer.lmk, lmk, ESPNOW_KEY_BYTES);
	return esp_now_is_peer_exist(address) ? esp_now_mod_peer(&peer) : esp_now_add_peer(&peer);
}

static void espnowSentDeliver(void *the, void *refcon, uint8_t *message, uint16_t messageLength)
{
	ESPNowRadio radio = refcon;
	if (!radio->closed) {
		xsSlot object = radio->object;
		espnowRelease(radio); // Application callbacks can throw or close the radio.
		xsBeginHost(the);
			xsCall1(object, xsID("onESPNowSent"), xsBoolean(messageLength && message[0]));
		xsEndHost(the);
		return;
	}
	espnowRelease(radio);
}

static void espnowReceiveDeliver(void *the, void *refcon, uint8_t *message, uint16_t messageLength)
{
	ESPNowRadio radio = refcon;
	if (!radio->closed && (messageLength >= ESPNOW_RECEIVE_HEADER_BYTES)) {
		char id[ESPNOW_ID_CHARS + 1], destination[ESPNOW_ID_CHARS + 1];
		uint16_t dataLength = (uint16_t)(message[7] | (message[8] << 8));
		if ((uint16_t)(dataLength + ESPNOW_RECEIVE_HEADER_BYTES) == messageLength) {
			espnowFormatID(message, id);
			espnowFormatID(message + 9, destination);
			xsSlot object = radio->object;
			espnowRelease(radio);
			xsBeginHost(the);
				xsmcVars(1);
				xsmcSetArrayBuffer(xsVar(0), message + ESPNOW_RECEIVE_HEADER_BYTES, dataLength);
				xsCall5(object, xsID("onESPNowReceive"), xsString(id), xsVar(0), xsString(destination), xsInteger((int8_t)message[6]), xsInteger(message[15]));
			xsEndHost(the);
			return;
		}
	}
	espnowRelease(radio);
}

#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
static void espnowSentCallback(const esp_now_send_info_t *info, esp_now_send_status_t status)
#else
static void espnowSentCallback(const uint8_t *address, esp_now_send_status_t status)
#endif
{
	ESPNowRadio radio = espnowAcquire();
	uint8_t message = (ESP_NOW_SEND_SUCCESS == status);
	(void)status;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0)
	(void)info;
#else
	(void)address;
#endif
	if (!radio) return;
	if (0 != modMessagePostToMachine(radio->the, &message, sizeof(message), espnowSentDeliver, radio)) {
		portENTER_CRITICAL(&gESPNowRadioMux);
		radio->sendNotificationsDropped++;
		portEXIT_CRITICAL(&gESPNowRadioMux);
		espnowRelease(radio);
	}
}

static void espnowReceiveCallback(const esp_now_recv_info_t *info, const uint8_t *data, int dataLength)
{
	ESPNowRadio radio;
	uint8_t message[ESPNOW_RECEIVE_HEADER_BYTES + ESPNOW_MAX_FRAME_BYTES];
	if (!info || !info->src_addr || !info->des_addr || !info->rx_ctrl ||
		dataLength < 0 || dataLength > ESPNOW_MAX_FRAME_BYTES) return;
	radio = espnowAcquire();
	if (!radio) return;
	portENTER_CRITICAL(&gESPNowRadioMux);
	if (radio->receivePending >= radio->receiveLimit) {
		radio->receiveDropped++;
		portEXIT_CRITICAL(&gESPNowRadioMux);
		espnowRelease(radio);
		return;
	}
	radio->receivePending++;
	portEXIT_CRITICAL(&gESPNowRadioMux);
	c_memcpy(message, info->src_addr, ESPNOW_ID_BYTES);
	message[6] = (uint8_t)info->rx_ctrl->rssi;
	message[7] = (uint8_t)dataLength;
	message[8] = (uint8_t)(dataLength >> 8);
	c_memcpy(message + 9, info->des_addr, ESPNOW_ID_BYTES);
	message[15] = info->rx_ctrl->channel;
	c_memcpy(message + ESPNOW_RECEIVE_HEADER_BYTES, data, dataLength);
	if (0 != modMessagePostToMachine(radio->the, message,
		(uint16_t)(ESPNOW_RECEIVE_HEADER_BYTES + dataLength), espnowReceiveDeliver, radio)) {
		espnowConsumeReceive(radio);
		portENTER_CRITICAL(&gESPNowRadioMux);
		radio->receiveDropped++;
		portEXIT_CRITICAL(&gESPNowRadioMux);
		espnowRelease(radio);
	}
}

static void espnowNativeClose(ESPNowRadio radio)
{
	uint8_t deinitialize = 0;
	uint8_t releaseOwner = 0;
	if (!radio) return;
	portENTER_CRITICAL(&gESPNowRadioMux);
	if (!radio->closed) {
		radio->closed = 1;
		releaseOwner = 1;
		if (gESPNowRadio == radio) {
			gESPNowRadio = NULL;
			deinitialize = 1;
		}
	}
	portEXIT_CRITICAL(&gESPNowRadioMux);
	if (!releaseOwner) return;
	if (deinitialize) {
		esp_now_unregister_send_cb();
		esp_now_unregister_recv_cb();
		esp_now_deinit();
	}
	espnowRelease(radio);
}

void xs_espnow_radio_destructor(void *data)
{
	espnowNativeClose(data);
}

void xs_espnow_radio_constructor(xsMachine *the)
{
	ESPNowRadio radio;
	esp_err_t error;
	wifi_ap_record_t ap;
	wifi_interface_t interface = WIFI_IF_STA;
	int32_t offlineChannel = 1;
	uint8_t occupied;
	xsSlot value;
	uint8_t pmk[ESPNOW_KEY_BYTES];
	uint8_t hasPMK = 0;
	int receiveLimit = 8;

	portENTER_CRITICAL(&gESPNowRadioMux);
	occupied = (NULL != gESPNowRadio);
	portEXIT_CRITICAL(&gESPNowRadioMux);
	if (occupied)
		xsUnknownError("a ESP-NOW radio is already open");
	if (xsmcGet(value, xsArg(0), xsID("interface")))
		interface = xsmcToInteger(value) ? WIFI_IF_AP : WIFI_IF_STA;
	if (xsmcGet(value, xsArg(0), xsID("offlineChannel")))
		offlineChannel = xsmcToInteger(value);
	if ((offlineChannel < 0) || (offlineChannel > 14))
		xsRangeError("invalid offline channel");

	if (xsmcGet(value, xsArg(0), xsID("receiveQueueLength")))
		receiveLimit = xsmcToInteger(value);
	if ((receiveLimit < 1) || (receiveLimit > 65535))
		xsRangeError("receiveQueueLength must be 1..65535");

	wifi_mode_t mode;
	if (ESP_OK != esp_wifi_get_mode(&mode))
		xsUnknownError("Wi-Fi must be initialized before ESP-NOW radio");
	if (!(mode & (interface == WIFI_IF_STA ? WIFI_MODE_STA : WIFI_MODE_AP)))
		xsUnknownError("selected Wi-Fi interface is not enabled");
	if (offlineChannel && ESP_OK != esp_wifi_sta_get_ap_info(&ap)) {
		error = esp_wifi_set_channel((uint8_t)offlineChannel, WIFI_SECOND_CHAN_NONE);
		if (ESP_OK != error)
			espnowThrowESPError(the, "set ESP-NOW channel", error);
	}

	if (xsmcGet(value, xsArg(0), xsID("pmk")) && xsmcTest(value)) {
		void *key;
		xsUnsignedValue length;
		xsmcGetBufferReadable(value, &key, &length);
		if (length != ESPNOW_KEY_BYTES) xsRangeError("PMK must be 16 bytes");
		c_memcpy(pmk, key, length);
		hasPMK = 1;
	}

	radio = c_calloc(1, sizeof(ESPNowRadioRecord));
	if (!radio)
		xsUnknownError("no memory for ESP-NOW radio");
	radio->the = the;
	radio->object = xsArg(1);
	radio->useCount = 1;
	radio->receiveLimit = receiveLimit;
	if (ESP_OK != esp_read_mac(radio->id, interface == WIFI_IF_STA ? ESP_MAC_WIFI_STA : ESP_MAC_WIFI_SOFTAP)) {
		c_free(radio);
		xsUnknownError("read ESP-NOW identity failed");
	}

	error = esp_now_init();
	if (ESP_OK != error) {
		c_free(radio);
		espnowThrowESPError(the, "initialize ESP-NOW radio", error);
	}
	portENTER_CRITICAL(&gESPNowRadioMux);
	gESPNowRadio = radio;
	portEXIT_CRITICAL(&gESPNowRadioMux);
	if (hasPMK) {
		error = esp_now_set_pmk(pmk);
		if (ESP_OK != error) goto fail;
	}
	error = esp_now_register_send_cb(espnowSentCallback);
	if (ESP_OK != error) goto fail;
	error = esp_now_register_recv_cb(espnowReceiveCallback);
	if (ESP_OK != error) goto fail;
	error = espnowAddOrUpdate(gBroadcastAddress, interface, 0, NULL);
	if (ESP_OK != error) goto fail;

	xsmcSetHostData(xsThis, radio);
	xsRemember(radio->object);
	return;

fail:
	espnowNativeClose(radio);
	espnowThrowESPError(the, "configure ESP-NOW radio", error);
}

void xs_espnow_radio_close(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostData(xsThis);
	if (!radio) return;
	xsmcSetHostData(xsThis, NULL);
	xsForget(radio->object);
	espnowNativeClose(radio);
}

void xs_espnow_radio_get_id(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	char id[ESPNOW_ID_CHARS + 1];
	espnowFormatID(radio->id, id);
	xsmcSetString(xsResult, id);
}

void xs_espnow_get_id(xsMachine *the)
{
	espnowSetIDResult(the);
}

void xs_espnow_radio_add_peer(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	uint8_t address[ESPNOW_ID_BYTES], key[ESPNOW_KEY_BYTES];
	const uint8_t *lmk = NULL;
	uint8_t channel = xsmcToInteger(xsArg(2));
	wifi_interface_t interface = xsmcToInteger(xsArg(3)) ? WIFI_IF_AP : WIFI_IF_STA;
	if (!espnowParseID(the, xsArg(0), address)) xsRangeError("invalid peer ID");
	if (xsmcTest(xsArg(1))) {
		void *buffer;
		xsUnsignedValue length;
		xsmcGetBufferReadable(xsArg(1), &buffer, &length);
		if (length != ESPNOW_KEY_BYTES) xsRangeError("LMK must be 16 bytes");
		c_memcpy(key, buffer, sizeof(key));
		lmk = key;
	}
	esp_err_t error = espnowAddOrUpdate(address, interface, channel, lmk);
	if (ESP_OK != error) espnowThrowESPError(the, "add ESP-NOW peer", error);
	(void)radio;
}

void xs_espnow_radio_get_peer(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	uint8_t address[ESPNOW_ID_BYTES];
	esp_now_peer_info_t peer;
	if (!espnowParseID(the, xsArg(0), address)) xsRangeError("invalid peer ID");
	esp_err_t error = esp_now_get_peer(address, &peer);
	if (ESP_ERR_ESPNOW_NOT_FOUND == error) return;
	if (ESP_OK != error) espnowThrowESPError(the, "get ESP-NOW peer", error);
	xsmcVars(1);
	xsmcSetNewObject(xsResult);
	xsmcSetInteger(xsVar(0), peer.channel);
	xsmcSet(xsResult, xsID("channel"), xsVar(0));
	xsmcSetString(xsVar(0), peer.ifidx == WIFI_IF_AP ? "ap" : "sta");
	xsmcSet(xsResult, xsID("interface"), xsVar(0));
	xsmcSetBoolean(xsVar(0), peer.encrypt);
	xsmcSet(xsResult, xsID("encrypted"), xsVar(0));
}

void xs_espnow_radio_consume_receive(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	espnowConsumeReceive(radio);
}

void xs_espnow_radio_get_info(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	uint32_t receiveDropped, sendNotificationsDropped;
	uint16_t receivePending;
	portENTER_CRITICAL(&gESPNowRadioMux);
	receiveDropped = radio->receiveDropped;
	sendNotificationsDropped = radio->sendNotificationsDropped;
	receivePending = radio->receivePending;
	portEXIT_CRITICAL(&gESPNowRadioMux);
	esp_now_peer_num_t peers;
	uint32_t version;
	uint8_t channel;
	wifi_second_chan_t secondary;
	esp_err_t error = esp_now_get_peer_num(&peers);
	if (ESP_OK != error) espnowThrowESPError(the, "get peer counts", error);
	error = esp_now_get_version(&version);
	if (ESP_OK != error) espnowThrowESPError(the, "get ESP-NOW version", error);
	error = esp_wifi_get_channel(&channel, &secondary);
	if (ESP_OK != error) espnowThrowESPError(the, "get Wi-Fi channel", error);
	xsmcVars(1);
	xsmcSetNewObject(xsResult);
	xsmcSetInteger(xsVar(0), version);
	xsmcSet(xsResult, xsID("version"), xsVar(0));
	xsmcSetInteger(xsVar(0), version >= 2 ? ESPNOW_MAX_FRAME_BYTES : ESP_NOW_MAX_DATA_LEN);
	xsmcSet(xsResult, xsID("maxDataLength"), xsVar(0));
	xsmcSetInteger(xsVar(0), peers.total_num);
	xsmcSet(xsResult, xsID("peerCount"), xsVar(0));
	xsmcSetInteger(xsVar(0), peers.encrypt_num);
	xsmcSet(xsResult, xsID("encryptedPeerCount"), xsVar(0));
	xsmcSetInteger(xsVar(0), channel);
	xsmcSet(xsResult, xsID("channel"), xsVar(0));
	xsmcSetUnsigned(xsVar(0), receiveDropped);
	xsmcSet(xsResult, xsID("receiveDropped"), xsVar(0));
	xsmcSetInteger(xsVar(0), receivePending);
	xsmcSet(xsResult, xsID("receivePending"), xsVar(0));
	xsmcSetUnsigned(xsVar(0), sendNotificationsDropped);
	xsmcSet(xsResult, xsID("sendNotificationsDropped"), xsVar(0));
}

void xs_espnow_radio_configure(xsMachine *the)
{
	xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	xsSlot value;
	esp_err_t error;
	if (xsmcGet(value, xsArg(0), xsID("channel"))) {
		int channel = xsmcToInteger(value);
		wifi_ap_record_t ap;
		if (channel < 1 || channel > 14) xsRangeError("invalid channel");
		if (ESP_OK == esp_wifi_sta_get_ap_info(&ap))
			xsUnknownError("cannot change channel while connected to an AP");
		error = esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
		if (ESP_OK != error) espnowThrowESPError(the, "set Wi-Fi channel", error);
	}
	if (xsmcGet(value, xsArg(0), xsID("pmk"))) {
		void *key;
		xsUnsignedValue length;
		xsmcGetBufferReadable(value, &key, &length);
		if (length != ESPNOW_KEY_BYTES) xsRangeError("PMK must be 16 bytes");
		error = esp_now_set_pmk(key);
		if (ESP_OK != error) espnowThrowESPError(the, "set PMK", error);
	}
}

void xs_espnow_radio_remove_peer(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	uint8_t address[ESPNOW_ID_BYTES];
	esp_err_t error;
	(void)radio;
	if (!espnowParseID(the, xsArg(0), address))
		xsRangeError("invalid peer ID");
	error = esp_now_del_peer(address);
	if ((ESP_OK != error) && (ESP_ERR_ESPNOW_NOT_FOUND != error))
		espnowThrowESPError(the, "remove ESP-NOW", error);
}

void xs_espnow_radio_send(xsMachine *the)
{
	ESPNowRadio radio = xsmcGetHostDataValidate(xsThis, xs_espnow_radio_destructor);
	uint8_t address[ESPNOW_ID_BYTES];
	uint8_t *data;

	uint8_t *sendData;
	xsUnsignedValue dataLength;
	size_t sendLength;
	esp_err_t error;
	if (radio->closed)
		xsUnknownError("ESP-NOW radio is closed");
	if (xsmcTest(xsArg(0))) {
		if (!espnowParseID(the, xsArg(0), address))
			xsRangeError("invalid peer ID");
	} else {
		c_memcpy(address, gBroadcastAddress, ESPNOW_ID_BYTES);
	}
	xsmcGetBufferReadable(xsArg(1), (void **)&data, &dataLength);
	if ((0 == dataLength) || (dataLength > ESPNOW_MAX_FRAME_BYTES))
		xsRangeError("invalid ESP-NOW frame length");
	sendData = data;
	sendLength = dataLength;

	error = esp_now_send(address, sendData, sendLength);
	if (ESP_OK != error)
		espnowThrowESPError(the, "send ESP-NOW frame", error);
}
