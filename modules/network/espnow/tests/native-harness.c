// Host stubs for the actual native callback/lifetime code, injected below.
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
typedef struct { int unused; } xsMachine;
typedef int xsSlot;
typedef int esp_err_t;
typedef int wifi_interface_t;
typedef int esp_now_send_status_t;
typedef struct { int unused; } esp_now_send_info_t;
typedef struct { int8_t rssi; uint8_t channel; } wifi_pkt_rx_ctrl_t;
typedef struct { uint8_t *src_addr, *des_addr; wifi_pkt_rx_ctrl_t *rx_ctrl; } esp_now_recv_info_t;
typedef struct { uint8_t peer_addr[6], lmk[16], channel; int ifidx, encrypt; } esp_now_peer_info_t;
#define ESP_IDF_VERSION_VAL(a,b,c) ((a)*10000+(b)*100+(c))
#ifndef ESP_IDF_VERSION
#define ESP_IDF_VERSION ESP_IDF_VERSION_VAL(6,1,0)
#endif
#define ESP_OK 0
#define ESP_NOW_SEND_SUCCESS 0
#define ESP_MAC_WIFI_STA 0
#define ESP_NOW_MAX_DATA_LEN 250
#define ESP_NOW_MAX_DATA_LEN_V2 1470
#define portMUX_TYPE int
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(mux) ((void)(mux))
#define portEXIT_CRITICAL(mux) ((void)(mux))
#define c_free free
#define c_malloc malloc
#define c_calloc calloc
#define c_memcpy memcpy
#define c_strlen strlen
#define c_snprintf snprintf
#define xsID(s) 0
#define xsThis 0
#define xsResult 0
#define xsVar(n) 0
#define xsBeginHost(t) ((void)(t))
#define xsEndHost(t) ((void)(t))
#define xsBoolean(v) (v)
#define xsString(v) 0
#define xsInteger(v) (v)
#define xsmcVars(n) ((void)0)
#define xsmcToStringBuffer(s,b,n) ((void)(s), snprintf(b,n,"001122334455"))
#define xsmcSetString(s,v) ((void)(s),(void)(v))
#define xsmcSetArrayBuffer(s,p,n) ((void)(s),(void)(p),(void)(n), allocations++)
#define xsUnknownError(...) abort()
#define xsCall1(...) (sentDelivered++)
#define xsCall5(...) (receivedDelivered++)
static unsigned allocations, sentDelivered, receivedDelivered, freed;
static void trackedFree(void *p) { freed++; free(p); }
#undef c_free
#define c_free trackedFree
static int esp_read_mac(uint8_t *p, int type) { (void)type; memset(p, 0, 6); return 0; }
static const char *esp_err_to_name(int error) { (void)error; return "error"; }
static int esp_now_is_peer_exist(const uint8_t *p) { (void)p; return 0; }
static int esp_now_add_peer(const esp_now_peer_info_t *p) { (void)p; return 0; }
static int esp_now_mod_peer(const esp_now_peer_info_t *p) { (void)p; return 0; }
static void esp_now_unregister_send_cb(void) {}
static void esp_now_unregister_recv_cb(void) {}
static void esp_now_deinit(void) {}
typedef void (*Delivery)(void *, void *, uint8_t *, uint16_t);
static struct { xsMachine *the; uint8_t *data; uint16_t size; Delivery callback; void *refcon; } messages[32];
static unsigned posted;
static int failPost;
static int modMessagePostToMachine(xsMachine *the, uint8_t *data, uint16_t size, Delivery callback, void *refcon) {
  if (failPost) return -1;
  assert(posted < 32);
  unsigned i = posted++;
  messages[i].the = the; messages[i].size = size;
  messages[i].data = malloc(size);
  memcpy(messages[i].data, data, size);
  messages[i].callback = callback; messages[i].refcon = refcon;
  return 0;
}
static void deliver(void) {
  unsigned count = posted;
  posted = 0;
  for (unsigned i = 0; i < count; i++) {
    messages[i].callback(messages[i].the, messages[i].refcon, messages[i].data, messages[i].size);
    free(messages[i].data);
  }
}

// CORE

static ESPNowRadio openRadio(xsMachine *the) {
  ESPNowRadio radio = calloc(1, sizeof(ESPNowRadioRecord));
  radio->the = the; radio->useCount = 1; radio->receiveLimit = 2;
  gESPNowRadio = radio;
  return radio;
}
int main(void) {
  xsMachine machine = {0};
  uint8_t source[6] = {0}, destination[6] = {0}, data[1470] = {1};
  wifi_pkt_rx_ctrl_t control = { .rssi = -50, .channel = 6 };
  esp_now_recv_info_t info = { .src_addr = source, .des_addr = destination, .rx_ctrl = &control };
  ESPNowRadio radio = openRadio(&machine);
  for (int i = 0; i < 10000; i++) espnowReceiveCallback(&info, data, sizeof(data));
  assert(posted == 2 && radio->receivePending == 2 && radio->receiveDropped == 9998);
  assert(radio->useCount == 3);
  deliver();
  assert(allocations == 2 && receivedDelivered == 2 && radio->useCount == 1);
  // Delivering JS notifications alone does not release an unread packet's credit.
  espnowReceiveCallback(&info, data, 1);
  assert(posted == 0 && radio->receiveDropped == 9999);
  espnowConsumeReceive(radio);
  failPost = 1;
  espnowReceiveCallback(&info, data, 1);
  assert(radio->receivePending == 1 && radio->receiveDropped == 10000);
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5,5,0)
  espnowSentCallback(NULL, ESP_NOW_SEND_SUCCESS);
#else
  espnowSentCallback(source, ESP_NOW_SEND_SUCCESS);
#endif
  assert(radio->sendNotificationsDropped == 1 && radio->useCount == 1);
  failPost = 0;
  espnowReceiveCallback(&info, data, 1);
  assert(posted == 1);
  espnowNativeClose(radio);
  assert(freed == 0); // queued delivery still owns its reference
  ESPNowRadio next = openRadio(&machine);
  deliver(); // old lifetime's data cannot reach the new radio
  assert(freed == 1 && receivedDelivered == 2 && next->receivePending == 0);
  espnowNativeClose(next);
  assert(freed == 2);
  puts("native receive admission, post failures, counters and close lifetime: PASS");
}
