import {} from "piu/MC";
import WiFi from "wifi";
import QrCodeScreen from "qrcodeScreen";

class WifiApConnectQRcodeBehavior extends Behavior {
  onCreate(application, data) {
    const AP_NAME = "SettingAP";
    const AP_PASSWORD = "12345678";
    WiFi.accessPoint({
      ssid: AP_NAME,
      password: AP_PASSWORD,
    });
    const qrString = `WIFI:S:${AP_NAME};T:WPA;P:${AP_PASSWORD};;`;

    application.add(
      new QrCodeScreen({
        string: qrString,
        labels: ["Wifi-setting", "Scan QR Code"],
      }),
    );
  }
}

const WifiApConnectQRcodeApp = Application.template(($) => ({
  Behavior: WifiApConnectQRcodeBehavior,
}));

export default function () {
  return new WifiApConnectQRcodeApp();
}
