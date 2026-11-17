# ESP-NOW for Moddable

ESP-IDF 5.0以降のESP32向けモジュールです。通常のアプリでは `espnow` を使います。送受信やWi-Fiの管理をアプリ側で行う場合は、低水準APIの `espnow/core` を使えます。どちらもModdableのI/O APIを参考にした独自APIであり、ECMA-419で標準化されたESP-NOW APIではありません。

| モジュール    | 役割                                                     | manifest             |
| ------------- | -------------------------------------------------------- | -------------------- |
| `espnow`      | Promise、送信キュー、データのコピー、Wi-Fiの自動初期化   | `manifest.json`      |
| `espnow/core` | 同期write、read、受信通知、MAC送信結果、相手の登録と設定 | `manifest_core.json` |

コアはWi-Fiをimport・初期化・終了しません。アプリがWi-Fiの開始と終了を管理します。独自ヘッダー、相手の発見、JSON、再送、分割・再構成、アプリケーションACKはどちらにも含みません。

`espnow/core` はECMA-419の[Base Class Pattern](https://419.ecma-international.org/#base-class-pattern)と[UDPのパケット送受信](https://419.ecma-international.org/#io-classes-udp-socket)に使い方を合わせています。optionsオブジェクト、受信通知とreadの組み合わせ、Byte Bufferの扱い、終了処理を共通パターンにそろえています。MAC送信結果のonSent、相手の登録、チャネルと暗号鍵の設定はESP-NOW固有のAPIです。

## コアの利用

アプリのmanifestに `$(MODDABLE)/examples/manifest_base.json` とこのディレクトリの `manifest_core.json` をincludeします。Wi-Fiを使うアプリは別途 `$(MODDABLE)/modules/embedded/network/interface/wifi` もincludeしてください。

```js
import WiFi from "embedded:network/interface/wifi";
import ESPNowCore, { BROADCAST } from "espnow/core";

const wifi = new WiFi({ onChanged() {} });
const radio = new ESPNowCore({
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

| API                                              | 内容                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `new ESPNowCore(options)`                        | optionsオブジェクト必須。既に動作しているWi-Fi上でESP-NOWを初期化。同時に1つ |
| `target`                                         | constructorのtargetを公開プロパティに保存。コールバックのthisから参照可能    |
| `id` / `info`                                    | MAC、チャネル、バージョン、最大データ長、全登録数、暗号化した相手の登録数    |
| `format`                                         | `"buffer"` のみ対応                                                          |
| `writable`                                       | 送信中でなければtrue                                                         |
| `write(data, peerId)`                            | 同期呼び出しで1件送信。戻り値なし。送信中や入力不正はその場で例外            |
| `onSent({ peerId, success })`                    | MAC送信結果を後で通知。writeから直接呼ばれない                               |
| `onReadable(count)`                              | 読み出せるパケットの件数を後で通知                                           |
| `read()`                                         | メタデータ付きArrayBufferを1件返す。空ならundefined                          |
| `read(buffer)`                                   | 指定したByte Bufferに1パケットを書き込み、バイト数を返す。空ならundefined    |
| `addPeer(id, { channel, interface, lmk })`       | 相手を登録・更新                                                             |
| `getPeer(id)` / `hasPeer(id)` / `removePeer(id)` | 登録情報参照・確認・削除。LMKは返さない                                      |
| `configure({ channel, pmk })`                    | チャネル・PMK変更。送信中は不可                                              |
| `close()` / `[Symbol.dispose]()`                 | 同じ終了処理。複数回呼べる。以後のコールバックは止まる                       |
| `getESPNowId()`                                  | STAのMACアドレスを取得                                                       |

コールバックの `this` はコアのインスタンスです。ネイティブ処理からの内部通知メソッドは公開しません。

optionsは省略できません。設定を省く場合も `new ESPNowCore({})` とします。コアはoptionsを書き換えず、対応する各プロパティを一度だけ読み取ります。コールバックは構築時に保存し、`null` または省略で通知を無効にできます。未知のプロパティと `io` は無視します。通常のAPIである `new ESPNow()` は引き続き引数を省略できます。

`read()` の戻り値はArrayBufferで、`peerId`、`destination`、`broadcast`、`rssi`、`channel` が付いています。UDP同様、通知後にreadで取り出します。受信バッファは `receiveQueueLength`（既定8件）で制限し、満杯なら新着パケットを破棄します。これはreadのための受信バッファであり、送信待ちキューではありません。

`read(buffer)` は指定したバッファに1パケットをコピーし、同じメタデータをそのバッファに付けます。ビューを渡した場合は、そのビューの範囲に書き込みます。バッファが小さい場合は例外を投げ、パケットは未読のまま残します。パケットの一部だけを読み出すことはできません。現実装では受信時にArrayBufferを作るため、`read(buffer)` を使っても受信時のメモリ確保はなくなりません。

コアは送信データをJavaScriptでコピーせず、ESP-IDFへ渡します。ESP-IDFはwriteが戻った後の送信元バッファを必要としません。次のwriteはonSentを受けてから呼びます。onSentは「次を送れる」通知とは区別したESP-NOW固有の結果通知で、成功しても相手アプリの受信を保証しません。ブロードキャストでは相手の受信自体も保証しません。

Serialの `onWritable(bytes)` は送信可能なバイト数を知らせる通知です。コアは1件ずつ送信し、送信結果を `onSent` で知らせます。このため、`onWritable` は提供しません。

## 通常のアプリでの利用

アプリのmanifestに `$(MODDABLE)/examples/manifest_base.json` とこのディレクトリをincludeします。`manifest.json` にはコアとWi-Fiも含まれます。

```js
import ESPNow from "espnow";

const radio = new ESPNow({
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

Stack-chanのアダプターと画面付きサンプルは `espnow` を使います。

以前の `espnow/queued` を使っているアプリは、import先を `espnow` に変更してください。低水準APIを使っているアプリは、import先を `espnow/core` に、include先を `manifest_core.json` に変更してください。クラス名とオプション型名は、通常のAPIが `ESPNow` と `ESPNowOptions`、低水準APIが `ESPNowCore` と `ESPNowCoreOptions` です。旧 `manifest_queued.json` は `manifest.json` をincludeする移行用ファイルとして残しています。

## 通信とWi-Fiの設定

- MACは12桁の16進数かコロン区切りを受け付け、戻り値は区切りなしの大文字です。
- `data` はECMA-419のByte Buffer（ArrayBuffer、SharedArrayBuffer、Uint8Array、Int8Array、DataView）を受け付けます。長さは1〜info.maxDataLengthバイトです。v1は250、対応するv2は最大1470バイトです。相手のバージョンを自動検出しないため、古い端末へは250バイト以内にしてください。
- コアのwriteで宛先を省略するとBROADCASTです。ラッパーのsend(undefined, data)も同じです。ESP-IDFのNULL宛先による全登録相手への送信とは異なります。
- ブロードキャスト相手は自動登録し、info.peerCountにも含みます。削除後に再送する場合は再登録してください。
- コアのchannel既定値は0（現在のチャネルを維持）、ラッパーはWi-Fiを管理する場合1です。AP接続中は接続先のチャネルを維持し、configureでのチャネル変更は拒否します。1〜14の利用可否は国・端末設定にも従います。
- interfaceはsta（既定）またはapです。対象インターフェースの有効化、AP作成、接続・スキャン・省電力との調整はアプリが担当します。
- pmkと相手ごとのlmkは16バイトのByte Bufferです。PMK未指定時はESP-IDFの既定値を使います。暗号化通信は相互に同じLMKで相手を登録してください。ブロードキャストの暗号化はできません。broadcastは認証済みを意味しません。
- 相手の登録上限はESP-IDF・sdkconfigに従います。送信中やラッパーの待機中に相手の登録を変更すると送信結果に影響します。
- 通常のAPIの実装は `espnow.ts`、低水準APIの実装は `core.ts` と `core.c` です。公開型もTypeScriptの実装からexportしており、mcconfigがTypeScriptをコンパイルします。

## 画面付きの送信・受信サンプル

M5Stack CoreS3など、320×240以上の画面を持つESP32端末を2台用意してください。サンプルは `espnow` とPiuのLabelを使い、タッチ操作なしで通信を開始します。画面にはMAC、チャネル、TX/RX/エラー件数、相手MAC、RSSI、PING/PONGの連番、返信時間を表示します。表示言語は端末フォントに合わせて英語です。

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

確認手順は次のとおりです。

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
