# IMU snapshot codec v1

ESP-NOW、Wi-Fi、描画、IMUドライバーに依存しない固定長16バイトのcodecです。
`manifest.json`をincludeし、`imu-sync`をimportします。加速度の単位はg、ボール座標は移動可能範囲を0〜1に正規化した左上位置です。

```js
import { encode, decode } from "imu-sync";
const buffer = encode({
  sequence: 0,
  accelerometer: { x: 0.1, y: -0.2, z: 1 },
  ball: { x: 0.5, y: 0.5 },
});
const snapshot = decode(buffer);
```

| オフセット | 長さ | 内容 |
| --- | --- | --- |
| 0 | 2 | ASCII `IM` (`49 4D`) |
| 2 | 1 | バージョン = 1 |
| 3 | 1 | 種別 = 1（加速度＋ボール位置） |
| 4 | 2 | uint16連番（65535の次は0） |
| 6 | 6 | XYZ各int16、1/1024 g単位 |
| 12 | 4 | XY各uint16、0〜65535で0〜1を表す |

複数バイトの数値はlittle-endianです。加速度は−32〜約31.999 gに、座標は0〜1に丸め込みます。量子化誤差は加速度で最大1/2048 g、座標で最大1/131070です。非有限数や不正な連番はencode時に例外になります。`encode(state, buffer)`で16バイトArrayBufferを再利用できます。

`decode(buffer)`は長さ・識別子・バージョン・種別が不正ならundefinedを返します。CRC、時刻、セッションID、再送、相手の識別は含みません。通信路がフレーム単位の境界と破損検出を提供する前提です。連番の比較や再起動時の扱いはアプリが決めます。位置を毎回含むため、過去の加速度を取り逃しても次のパケットで位置を復元できます。

```sh
node --test modules/data/imu-sync/tests/*.test.mjs
```
