# IMUでボール位置を同期する

320×240のディスプレイを持つESP32端末を2台使います。senderにはIMUが必要ですが、receiverには不要です。senderを傾けると、双方の画面でボールが動き、XYZの加速度を表示します。ボールの移動方向は加速度Xの正方向が左、Yの正方向が下です。UIはPocoで描画しています。

Moddable SDKの `examples/drivers/sensors/bmi270/bounce` を参考にしています。`shared/ball.png` および描画処理の元実装は Moddable Tech, Inc. の著作物で、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)に従います。

それぞれの端末だけを接続し、リポジトリルートから実行します。

```sh
(cd examples/network/espnow/imu-sync/sender && mcconfig -d -m -p esp32/m5stack_cores3)
(cd examples/network/espnow/imu-sync/receiver && mcconfig -d -m -p esp32/m5stack_cores3)
```

各manifestの `config.imuSync` で設定します。

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| role | sender / receiver | 役割 |
| channel | 1 | 両端末で同じWi-Fiチャネル |
| interval | 33 | 更新間隔（ms）、約30 Hz |
| accelerationScale | 9.80665 | IMU値をgへ換算する除数。gを返すセンサーなら1 |
| peerId | 未設定 | senderでは送信先MAC、receiverでは受信を許可するMAC |

CoreS3のBMI270は `device.sensor.IMU` がm/s²で返すため、そのまま利用できます。`device.sensors.IMU` を持つproviderにも対応しています。異なる端末ではIMUの単位・軸方向を確認してください。両端末で同じ描画領域ならボールのピクセル位置も一致します。異なる画面サイズでは相対位置を合わせます。

既定は暗号化なしのブロードキャストです。receiverは最初の有効なsenderを選び、2秒間受信がない場合に別のsenderを受け入れます。複数組を動かす場合は、双方に `peerId` を設定してください。画面下段とログに各端末のMACを表示します。通常のWi-Fi接続は行いません。既存のWi-Fi接続があるとチャネルが制約されるため、このexampleは単独で実行してください。

通信は独立した [imu-sync codec](../../../../modules/data/imu-sync/README.md) を使い、1パケット16バイト（約485 bytes/秒、無線ヘッダーを除く）です。senderが物理演算を行い、加速度XYZ・連番・正規化したボール座標を送ります。sender自身も送信時と同じ量子化された値を描画します。receiverは独自に物理演算せず、受信した位置を表示するため、欠落による積分誤差が蓄積しません。無線・描画の遅延による短い時間差はあります。

古いフレームの再送・アプリケーションACK・補間は行いません。送信中ならその時点の送信をスキップして、次回の最新状態を送ります。receiverは重複・逆順の連番を破棄し、2秒の無通信後はsenderの再起動による連番リセットも受け入れます。1秒以上受信がない場合は `waiting` と表示し、最後の位置を保持します。senderの `TX` は相手の受信確認を意味しません。

確認手順:

1. receiverを起動し、`waiting`を確認する。
2. senderを起動して傾け、双方のXYZ・ボール位置・連番が追従することを確認する。
3. senderを停止し、receiverが最後の位置を保持して`waiting`になることを確認する。
4. senderを再起動し、同期が復帰することを確認する。

JavaScriptの検証:

```sh
node --test modules/data/imu-sync/tests/*.test.mjs modules/network/espnow/imu-sync/tests/*.test.mjs examples/network/espnow/imu-sync/tests/*.test.mjs
```
