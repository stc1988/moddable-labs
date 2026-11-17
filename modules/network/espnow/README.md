# ESP-NOW for Moddable

ESP-IDF 5.0以降のESP32向けモジュールです。通常のアプリでは `espnow` を使います。送受信やWi-Fiの管理をアプリ側で行う場合は、低水準APIの `espnow/core` を使えます。どちらもModdableのI/O APIを参考にした独自APIであり、ECMA-419で標準化されたESP-NOW APIではありません。

| モジュール    | 役割                                                     | manifest             |
| ------------- | -------------------------------------------------------- | -------------------- |
| `espnow`      | Promise、送信キュー、データのコピー、Wi-Fiの自動初期化   | `manifest.json`      |
| `espnow/core` | 同期write、read、受信通知、MAC送信結果、相手の登録と設定 | `manifest_core.json` |

コアはWi-Fiをimport・初期化・終了しません。アプリがWi-Fiの開始と終了を管理します。独自ヘッダー、相手の発見、JSON、再送、分割・再構成、アプリケーションACKはどちらにも含みません。命令向けのACK・再送が必要な場合は、任意で追加する `espnow/reliable` を使えます。

`espnow/core` はECMA-419の[Base Class Pattern](https://419.ecma-international.org/#base-class-pattern)と[UDPのパケット送受信](https://419.ecma-international.org/#io-classes-udp-socket)に使い方を合わせています。optionsオブジェクト、受信通知とreadの組み合わせ、Byte Bufferの扱い、終了処理を共通パターンにそろえています。MAC送信結果のonSent、相手の登録、チャネルと暗号鍵の設定はESP-NOW固有のAPIです。

## 設計・運用の指針

[ESP-NOWの設計・運用ガイド](./BEST_PRACTICES.md) に、coreの実装済みガードレールと変更時に守る制約、アプリ側の送信方式・チャネル・受信検証・鍵・再送・復旧の判断基準をまとめています。実機確認の観点も参照できます。

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
| `id` / `info`                                    | MAC、チャネル、バージョン、最大データ長、登録数、受信待機数、受信破棄数、送信通知破棄数    |
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

`read()` の戻り値はArrayBufferで、`peerId`、`destination`、`broadcast`、`rssi`、`channel` が付いています。UDP同様、通知後にreadで取り出します。受信バッファは `receiveQueueLength`（既定8件、1〜65535件）で制限し、満杯なら新着パケットを破棄します。C側の通知待ちとJS側の未読パケットを合わせて制限し、満杯の場合はコピーや通知メッセージの確保、ArrayBuffer生成の前に破棄します。readで1件取り出すと、その受け入れ枠が戻ります。これはreadのための受信バッファであり、送信待ちキューではありません。

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
- 送信完了通知を `sendTimeout`（既定2000ms、正の整数）以内に受け取れなければ、送信中と待機中のPromiseをrejectし、コアを終了します。`faulted` がtrueになり、`onError(error)` で通知します。`recover()` で再初期化するまで送信を受け付けません。

Stack-chanのアダプターと画面付きサンプルは `espnow` を使います。

以前の `espnow/queued` を使っているアプリは、import先を `espnow` に変更してください。低水準APIを使っているアプリは、import先を `espnow/core` に、include先を `manifest_core.json` に変更してください。クラス名とオプション型名は、通常のAPIが `ESPNow` と `ESPNowOptions`、低水準APIが `ESPNowCore` と `ESPNowCoreOptions` です。旧 `manifest_queued.json` は `manifest.json` をincludeする移行用ファイルとして残しています。

## 受信負荷の確認

`info` は次の累計値と現在値も返します。累計値はコアの生存期間内の32ビットカウンターで、再初期化するとリセットされます。

| プロパティ | 内容 |
| --- | --- |
| `receivePending` | C側で受け入れ済みの通知待ち・JS側の未読パケットの合計 |
| `receiveDropped` | 受信枠不足、またはネイティブ通知の確保失敗で破棄した件数 |
| `sendNotificationsDropped` | MAC送信結果をJSへ通知できなかった件数 |

`read(buffer)` でバッファが小さすぎる場合は、パケットも受け入れ枠も保持します。利用者がread後に保持するバッファや、onReceive内で独自に蓄積するデータはこの上限に含みません。

## 用途に応じた送信

通常の `send(peerId, data)` はFIFOのままです。センサー値や姿勢のように最新値を優先する場合は `sendLatest(peerId, data, key)` を使います。同じ宛先・keyで**待機中**の1件を新しいコピーで置き換えます。送信中のデータ、別のkey、通常のsendは置き換えません。keyの既定値は空文字列です。

```js
radio.sendLatest(peerId, imuBytes, "imu").catch(error => {
  // 置き換えられた送信も、通信失敗もここへ通知されます。
  trace(`${error.message}\n`);
});
```

置き換えられたPromiseは `ESP-NOW send superseded by newer data` でrejectします。キューが上限でも既存の待機枠の置き換えは可能です。新しいデータが不正な場合、元の待機データは保持します。

### 命令向けのACKと再送

`manifest_reliable.json` をincludeし、`espnow/reliable` をimportします。この追加レイヤーは通常のespnowと異なる通信形式を使うため、双方で利用してください。相手は、ACKを返せるように両側で事前登録します。暗号化する場合は通常どおり相互にLMKを設定します。

```js
import ESPNow from "espnow";
import ReliableESPNow from "espnow/reliable";

let commands;
const radio = new ESPNow({
  channel: 1,
  onReceive(event) {
    if (!commands?.receive(event)) {
      // 通常のパケットをここで処理できます。
    }
  },
});
const peerId = "AABBCCDDEEFF"; // 相手のMACに変更します。
radio.addPeer(peerId);
commands = new ReliableESPNow({
  radio,
  sessionId: 1, // 動作例。本番では起動・再作成ごとに未使用のIDへ更新します。
  ackTimeout: 250,
  retries: 3,
  onCommand({ peerId, data, sessionId, sequence }) {
    // 同期処理、またはPromiseを返す非同期処理。
    // 正常終了後にACKを返します。
  },
});
await commands.send(peerId, Uint8Array.of(1));
// 終了時はcommands.close()、radio.close()の順で呼びます。
```

- `send()` の成功は、相手のonCommandが正常終了し、そのACKを受け取ったことを示します。通常のradio.sendのMAC成功とは異なります。
- 命令を1件ずつ送信します。`queueLimit`（既定8件）は送信中を含みます。ACK待ちの間も、通常のradio.sendや返信ACKは送れます。
- `ackTimeout` はMAC成功後のACK待ち時間です。MAC失敗時も同じ時間を待って再試行します。`retries`（既定3回、0〜100回）は初回に加える再送回数です。再送は同一のsessionId・連番・データを使います。
- ユニキャスト専用です。ブロードキャスト命令にはACKを返しません。payloadは1〜234バイトで、16バイトのヘッダーを含めて250バイト以内に収めます。
- 受信履歴は送信元MACとsessionIdごとの処理済み連番です。重複時は処理を繰り返さずACKだけ返します。非同期処理中の重複には、処理完了までACKしません。
- `receiveSessionLimit`（既定32組）で履歴を制限します。満杯の場合は新規sessionの命令を受け付けず、既存履歴を維持します。新規sessionを受け入れる運用では、遅延パケットが残らない時点で受信側レイヤーを作り直してください。
- 同じ送信元では、同一sessionIdを持つ送信レイヤーを並行して動かさないでください。sessionIdは1〜0xFFFFFFFFの整数です。起動・再作成のたびに未使用の値を割り当てます。連番は折り返さず、上限で送信を拒否します。
- 履歴はRAM上です。受信側の再起動をまたぐ重複実行防止や、処理途中の例外・電源断まで含むexactly-onceは保証しません。必要な命令はアプリ側でも冪等にするか、実行IDを永続化してください。onCommandのthrow/rejectにはACKを返さず、同じ命令が再試行されます。
- `receive(event)` は、この形式のパケットならtrue、通常の形式ならfalseを返します。`close()` は命令とACK待ちタイマーを終了しますが、渡したradioは閉じません。

通信形式は、先頭4バイトがASCIIのENOW、次の1バイトがバージョン1、種別が1（命令）または2（ACK）、予約領域2バイトが0、sessionIdと連番がそれぞれ32ビットのビッグエンディアンです。ACKはヘッダーのみです。ACKの送信元MAC、sessionId、連番が一致した場合のみ送信成功とします。

## 送信完了通知が失われた場合の復旧

タイムアウト後は、遅延した完了通知で次の送信を誤って完了させないようにコアを閉じます。`recover()` は新しいコアを作り、チャネル・PMK・登録相手・LMKを復元します。鍵は登録時のコピーを保持するため、呼び出し側が元のバッファを再利用しても復旧設定は変わりません。Wi-Fiの所有関係も維持します。

```js
const radio = new ESPNow({
  sendTimeout: 2000,
  onError(error) {
    trace(`${error.message}\n`);
    // 通信状態を確認したうえで再開する場合:
    this.recover();
  },
});
```

`recover()` は失敗した送信を再投入しません。相手で実行済みの可能性があるためです。復旧に失敗した場合は例外となり、faultedのままなので、後で再試行するかcloseできます。明示的なclose後はrecoverできません。自動登録のブロードキャスト相手は復旧時に再作成します。

`espnow/core` は低水準APIのためタイムアウト・自動復旧を持ちません。コアを直接使う場合は、アプリ側でタイムアウト時にcloseし、新規インスタンスへ相手を再登録してください。JSが長時間停止している間はタイマーも実行できないため、sendTimeoutは厳密な実時間の期限ではありません。

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

リポジトリのルートから `node --test modules/network/espnow/tests/*.test.mjs` で、TypeScriptをコンパイルし、偽のネイティブ・Wi-Fi・Piu環境で検証します。`tsc` とホストのCコンパイラー（`cc`、AddressSanitizer/UndefinedBehaviorSanitizer対応）がPATHに必要です。送信完了・ACKの紛失、重複、待機中の値の置き換え、復旧、ネイティブの受信上限と破棄数、close時の寿命も検証します。ネイティブテストは実装のCコールバック部分をホスト用スタブと組み合わせて実行します。無線や実際の描画を検証するものではありません。

IMUボール同期の使い方は [examplesのREADME](../../../examples/network/espnow/imu-sync/README.md) を参照してください。IMU同期codecは `modules/data/imu-sync` にあり、ESP-NOWコアとは独立しています。
