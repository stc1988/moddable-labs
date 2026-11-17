# ESP-NOW for Moddable

ESP-IDF 5.0以降のESP32向けモジュールです。低水準のコアと、必要なアプリだけが使う送信キュー付きラッパーを分けています。ECMA-419の標準ESP-NOW APIではなく、ModdableのI/O APIを参考にした独自APIです。

| モジュール      | 役割                                                     | manifest               |
| --------------- | -------------------------------------------------------- | ---------------------- |
| `espnow`        | 同期write、read、受信通知、MAC送信結果、相手の登録と設定 | `manifest.json`        |
| `espnow/queued` | Promise、送信キュー、データのコピー、Wi-Fiの自動初期化   | `manifest_queued.json` |

コアはWi-Fiをimport・初期化・終了しません。アプリがWi-Fiの開始と終了を管理します。独自ヘッダー、相手の発見、JSON、再送、分割・再構成、アプリケーションACKはどちらにも含みません。

## コアの利用

アプリのmanifestに `$(MODDABLE)/examples/manifest_base.json` とこのディレクトリをincludeします。Wi-Fiを使うアプリは別途 `$(MODDABLE)/modules/embedded/network/interface/wifi` もincludeしてください。

```js
import WiFi from "embedded:network/interface/wifi";
import ESPNow, { BROADCAST } from "espnow";

const wifi = new WiFi({ onChanged() {} });
const radio = new ESPNow({
  channel: 1,
  format: "buffer",
  onReadable(count) {
    for (let index = 0; index < count; index++) {
      const packet = this.read();
      trace(`${packet.peerId}: ${packet.byteLength} bytes / ${packet.rssi} dBm
`);
    }
  },
  onSent({ peerId, success }) {
    trace(`${peerId}: MAC result=${success}
`);
  },
});
radio.write(Uint8Array.of(1, 2, 3), BROADCAST);
// 終了時は radio.close() の後で wifi.close() を呼びます。
```

| API                                              | 内容                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `new ESPNow(options)`                            | 既に動作しているWi-Fi上でESP-NOWを初期化。同時に1つ                       |
| `target`                                         | constructorのtargetを公開プロパティに保存。コールバックのthisから参照可能 |
| `id` / `info`                                    | MAC、チャネル、バージョン、最大データ長、全登録数、暗号化した相手の登録数 |
| `format`                                         | `"buffer"` のみ対応                                                       |
| `writable`                                       | 送信中でなければtrue                                                      |
| `write(data, peerId)`                            | 同期呼び出しで1件送信。戻り値なし。送信中や入力不正はその場で例外         |
| `onSent({ peerId, success })`                    | MAC送信結果を後で通知。writeから直接呼ばれない                            |
| `onReadable(count)`                              | 読み出せるパケットの件数を後で通知                                        |
| `read()`                                         | メタデータ付きArrayBufferを1件返す。空ならundefined                       |
| `addPeer(id, { channel, interface, lmk })`       | 相手を登録・更新                                                          |
| `getPeer(id)` / `hasPeer(id)` / `removePeer(id)` | 登録情報参照・確認・削除。LMKは返さない                                   |
| `configure({ channel, pmk })`                    | チャネル・PMK変更。送信中は不可                                           |
| `close()` / `[Symbol.dispose]()`                 | 同じ終了処理。複数回呼べる。以後のコールバックは止まる                    |
| `getESPNowId()`                                  | STAのMACアドレスを取得                                                    |

コールバックの `this` はコアのインスタンスです。ネイティブ処理からの内部通知メソッドは公開しません。

`read()` の戻り値はArrayBufferで、`peerId`、`destination`、`broadcast`、`rssi`、`channel` が付いています。UDP同様、通知後にreadで取り出します。受信バッファは `receiveQueueLength`（既定8件）で制限し、満杯なら新着パケットを破棄します。これはreadのための受信バッファであり、送信待ちキューではありません。

コアは送信データをJavaScriptでコピーせず、ESP-IDFへ渡します。ESP-IDFはwriteが戻った後の送信元バッファを必要としません。次のwriteはonSentを受けてから呼びます。onSentは「次を送れる」通知とは区別したESP-NOW固有の結果通知で、成功しても相手アプリの受信を保証しません。ブロードキャストでは相手の受信自体も保証しません。

## アプリ向けのラッパー

`manifest_queued.json` をincludeすると、コアとWi-Fiも含まれます。

```js
import QueuedESPNow from "espnow/queued";

const radio = new QueuedESPNow({
  channel: 1,
  queueLimit: 32,
  onReceive({ peerId, data }) {
    trace(`${peerId}: ${data.byteLength} bytes
`);
  },
});
await radio.send(undefined, Uint8Array.of(1, 2, 3));
radio.close();
```

- sendはデータをコピーして順番に送信します。キュー上限は送信中も含めてqueueLimit（既定32件）で、超過はrejectします。
- closeは待機中・送信中のPromiseをrejectし、以後の受信通知を止めます。
- 通常はWi-Fiを内部で開きます。`manageWiFi: false` ならWi-Fiはアプリが管理します。
- コアの相手登録API、id、info、configureに加え、未完了の送信件数をpendingで取得できます。
- onReceiveのthisはラッパーです。targetも使えます。
- 旧版のofflineChannelとaddPeer(id, lmk)はこのラッパーだけで受け付けます。
- 無線の結果通知が失われた場合は後続送信を進めず、closeで破棄できます。タイムアウトや再送はアプリ側で実装してください。

Stack-chanのアダプターと画面付きサンプルはこのラッパーを使います。

## 通信とWi-Fiの設定

- MACは12桁の16進数かコロン区切りを受け付け、戻り値は区切りなしの大文字です。
- `data` はArrayBufferかUint8Array、長さは1〜info.maxDataLengthバイトです。v1は250、対応するv2は最大1470バイトです。相手のバージョンを自動検出しないため、古い端末へは250バイト以内にしてください。
- コアのwriteで宛先を省略するとBROADCASTです。ラッパーのsend(undefined, data)も同じです。ESP-IDFのNULL宛先による全登録相手への送信とは異なります。
- ブロードキャスト相手は自動登録し、info.peerCountにも含みます。削除後に再送する場合は再登録してください。
- コアのchannel既定値は0（現在のチャネルを維持）、ラッパーはWi-Fiを管理する場合1です。AP接続中は接続先のチャネルを維持し、configureでのチャネル変更は拒否します。1〜14の利用可否は国・端末設定にも従います。
- interfaceはsta（既定）またはapです。対象インターフェースの有効化、AP作成、接続・スキャン・省電力との調整はアプリが担当します。
- pmkと相手ごとのlmkは16バイトです。PMK未指定時はESP-IDFの既定値を使います。暗号化通信は相互に同じLMKで相手を登録してください。ブロードキャストの暗号化はできません。broadcastは認証済みを意味しません。
- 相手の登録上限はESP-IDF・sdkconfigに従います。送信中やラッパーの待機中に相手の登録を変更すると送信結果に影響します。
- モジュール実装はespnow.tsとqueued.tsです。公開型も実装からexportしており、mcconfigがTypeScriptをコンパイルします。

## 画面付きの送信・受信サンプル

M5Stack CoreS3など、320×240以上の画面を持つESP32端末を2台用意してください。サンプルはアプリ向けの `espnow/queued` とPiuのLabelを使い、タッチ操作なしで通信を開始します。画面にはMAC、チャネル、TX/RX/エラー件数、相手MAC、RSSI、PING/PONGの連番、返信時間を表示します。表示言語は端末フォントに合わせて英語です。

| 端末   | manifest                                                   | 動作                                                     |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------- |
| 送信側 | `examples/network/espnow/broadcast/sender/manifest.json`   | 1秒ごとに連番付きPINGを送信し、PONGを待つ                |
| 受信側 | `examples/network/espnow/broadcast/receiver/manifest.json` | PINGを表示し、送信元へユニキャストで同じ連番のPONGを返す |

リポジトリのルートから、それぞれ次のようにビルド・書き込みします。

```sh
(cd examples/network/espnow/broadcast/sender && mcconfig -d -m -p esp32/m5stack_cores3)
(cd examples/network/espnow/broadcast/receiver && mcconfig -d -m -p esp32/m5stack_cores3)
```

書き込み時は対象の端末のみ接続してください。

初期設定はCH 1、暗号化なしのブロードキャストです。manifestの `config.espnowSample` で設定を変更できます。

```json
{
  "role": "sender",
  "channel": 1,
  "peerId": "AABBCCDDEEFF",
  "pmk": "00112233445566778899AABBCCDDEEFF",
  "lmk": "FFEEDDCCBBAA99887766554433221100"
}
```

`peerId` を設定するとユニキャストで送信します。暗号化を試す場合は、両方のmanifestに相手のMACと同じPMK・LMKを設定します。ここに示した鍵はサンプル専用です。受信側の `role` は `receiver` のままにしてください。CHは両方で同じにします。

確認手順:

1. 受信側を起動し、画面のMACとCHを確認する。
2. 送信側を起動し、双方のTX/RXと連番が増え、送信側に `Reply in ... ms` が出ることを確認する。
3. 受信側の電源を切り、送信側に `No application reply` が出ることを確認する。ブロードキャストのMAC送信成功との違いが分かる。
4. 再起動して通信が復帰することを確認する。
5. 必要に応じ、相互のMACを設定したユニキャスト、同じLMKでの暗号化通信も試す。

`Sent (MAC), waiting reply` はMAC層での送信成功、`Reply in ... ms` は受信側アプリからの返信確認です。この返信処理とJSON形式はサンプルだけのもので、汎用モジュールには入りません。

ログだけの最小例は `examples/network/espnow/broadcast/minimal` に残しています。

## 検証と参照

リポジトリのルートから `node --test modules/network/espnow/tests/*.test.mjs` で、TypeScriptをコンパイルし、偽のネイティブ・Wi-Fi・Piu環境で検証します。`tsc` がPATHに必要です。無線や実際の描画を検証するものではありません。

IMUボール同期の使い方は [examplesのREADME](../../../examples/network/espnow/imu-sync/README.md) を参照してください。IMU同期codecは `modules/data/imu-sync` にあり、ESP-NOWコアとは独立しています。
