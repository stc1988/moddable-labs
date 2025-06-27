import BLEServer from "bleserver";
import { uuid } from "btutils";
import Timer from "timer";

const HEART_RATE_SERVIE_UUID = uuid`180D`;

class HeartRateService extends BLEServer {
  onReady() {
    this.deviceName = "ModdableTest";
    this.onDisconnected();
  }
  onConnected() {
    this.stopAdvertising();
  }
  onDisconnected() {
    this.startAdvertising({
      advertisingData: {
        flags: 6,
        completeName: this.deviceName,
        completeUUID16List: [HEART_RATE_SERVIE_UUID],
      },
    });
  }
  onCharacteristicNotifyEnabled(characteristic) {
    const name = characteristic.name;
    trace(`[onCharacteristicNotifyEnabled]${name}\n`);
    if (name === "c1") {
      Timer.repeat((_id) => {
        this.notifyValue(characteristic, 0);
      }, 5000);
    } else if (name === "c2") {
      Timer.repeat((_id) => {
        this.notifyValue(characteristic, 1);
      }, 5000);
    } else if (name === "c3") {
      Timer.repeat((_id) => {
        this.notifyValue(characteristic, 2);
      }, 5000);
    } else if (name === "c4") {
      Timer.repeat((_id) => {
        this.notifyValue(characteristic, 3);
      }, 5000);
    } else if (name === "c5") {
      Timer.repeat((_id) => {
        this.notifyValue(characteristic, 4);
      }, 5000);
    }
  }
}

const _hrs = new HeartRateService();
