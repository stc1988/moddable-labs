
    import BLEClient from "bleclient";
    import {uuid} from "btutils";
    
    const HR_SERVICE_UUID = uuid`180D`;
    const C1_CHARACTERISTIC_UUID = uuid`2A37`;
    
    class HeartRateClient extends BLEClient {
        onReady() {
            this.onDisconnected();
        }
        onDiscovered(device) {
            trace(`[onDiscovered]\n`)
            let found = false;
            let uuids = device.scanResponse.completeUUID16List;
            if (uuids)
                found = uuids.find(uuid => uuid.equals(HR_SERVICE_UUID));
            if (!found) {
                uuids = device.scanResponse.incompleteUUID16List;
                if (uuids)
                    found = uuids.find(uuid => uuid.equals(HR_SERVICE_UUID));
            }
            if (found) {
                trace(`found\n`)
                this.stopScanning();
                this.connect(device);
            }
        }
        onConnected(device) {
            trace(`[onConnected]\n`)
            device.discoverPrimaryService(HR_SERVICE_UUID);
        }
        onDisconnected() {
            this.startScanning();
        }
        onServices(services) {
            if (services.length)
                services[0].discoverAllCharacteristics();
        }
        onCharacteristics(characteristics) {
            trace(`[onCharacteristics]${characteristics.length} characteristics found\n`);
            characteristics.forEach((characteristic) => {
                trace(`[onCharacteristics]${characteristic.name}\n`);
                characteristic.enableNotifications()
            })
        }
        onCharacteristicNotificationEnabled(characteristic) {
            trace(`[onCharacteristicNotificationEnabled]${characteristic.name}\n`)

        }
        onCharacteristicNotification(characteristic, value) {
            trace(`[onCharacteristicNotification]${value}\n`);
        }
    }
    
    let hrc = new HeartRateClient;
    
    
    