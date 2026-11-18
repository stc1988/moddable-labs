# ESP-IDFの相手発見・暗号化ユニキャスト例

ESP-IDF v6.1の `examples/wifi/espnow` を、`espnow/core` で確認するための移植例です。画面は使わず、xsdbのログで相手発見、相手の登録、暗号化ユニキャストへの切り替え、MAC送信結果を確認します。

移植元はEspressifの [espnow_example_main.c](https://github.com/espressif/esp-idf/blob/v6.1/examples/wifi/espnow/main/espnow_example_main.c) と [espnow_example.h](https://github.com/espressif/esp-idf/blob/v6.1/examples/wifi/espnow/main/espnow_example.h) です。元のサンプルと同じPublic Domain / CC0の条件で提供します。

## 確認する範囲

| 確認項目               | 動作                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| ブロードキャスト送受信 | 自分のmagic値と受信状態を通知する                                                  |
| バイナリ形式とCRC      | IDFの10バイトヘッダー、リトルエンディアン、CRC16を使用する                         |
| 相手の登録             | 最初の有効なブロードキャストの送信元を、LMK付きで登録する                          |
| 宛先の切り替え         | 相手のstateが1になったら、magic値が大きい側がユニキャストを送る                    |
| 暗号化ユニキャスト     | 共通のPMK・LMKで通信し、受信側はブロードキャスト送信を止める                       |
| coreの送信制限         | ブロードキャスト送信中に切り替え条件を満たしても、onSentまで次のwriteを待つ        |
| 終了処理               | 送信回数到達・write失敗・完了通知待ちタイムアウトでタイマー、core、Wi-Fiを終了する |

同じアプリを書き込んだ2台、または本アプリ1台とIDF公式サンプル1台で確認できます。公式サンプルとの無線相互通信は実機での確認が必要です。既存のJSON PING/PONGやIMU同期サンプルとは通信形式が異なります。

## 設定

`manifest.json` の `config.idfPeer` を変更します。

| 項目        | 既定値                          | 内容                                                        |
| ----------- | ------------------------------- | ----------------------------------------------------------- |
| channel     | 1                               | 双方で同じ値にする。1〜14のうち端末・国設定で使えるチャネル |
| magic       | 起動時に生成                    | 役割を決める0〜0xFFFFFFFFの整数。認証用の乱数ではない       |
| length      | 10                              | ヘッダーを含む10〜1470バイト。相手の対応が不明なら250以内   |
| count       | 100                             | ユニキャスト送信回数。1〜65535。MAC失敗も1回として数える    |
| delay       | 1000                            | 次の送信までの待機時間。0〜65535ms                          |
| sendTimeout | 2000                            | MAC送信完了通知の待ち時間。1〜2147483647ms                  |
| pmk         | IDFサンプルと同じ16バイト文字列 | `pmk1234567890123`。隔離した動作確認専用                    |
| lmk         | IDFサンプルと同じ16バイト文字列 | `lmk1234567890123`。隔離した動作確認専用                    |

PMK・LMKは16 UTF-8バイトの文字列で、16進数表記ではありません。本番用の鍵として使わないでください。鍵はログに出しません。

役割を固定して確認する場合は、片側のmagicを100、もう片側を200に設定します。大きい側が送信側です。等しい場合はIDF同様に双方が送信側になり得るため、切り分け時は異なる値を使います。

## 2台での確認手順

1. ESP32端末を2台用意し、同じチャネル・PMK・LMKを設定します。
2. このディレクトリから、対象の端末だけを接続して次のコマンドでビルド・書き込みします。例はM5Stack CoreS3です。

   ```sh
   mcconfig -dl -m -p esp32/m5stack_cores3
   ```

3. もう1台にも書き込み、両方を再起動します。通常は起動から5秒後にブロードキャストを開始します。
4. 両側の `PEER ... encrypted=true` を確認します。これはLMK付きの登録完了であり、このログだけでは暗号化通信の成功を意味しません。
5. magicが大きい側で `SWITCH unicast` と `TX MAC ... success=true`、小さい側で `RX unicast` と `LISTEN encrypted unicast` を確認します。
6. 送信側で指定回数後に `STOP Send done (MAC results only)` と `STATS` が出ることを確認します。受信側は受信待ちを続けます。やり直すときは両側を再起動します。

ログ例（MAC・RSSIなどは端末によって異なります）:

```text
PEER AABBCCDDEEFF encrypted=true
RX broadcast from=AABBCCDDEEFF seq=1 state=1 rssi=-50
SWITCH unicast to=AABBCCDDEEFF
TX MAC to=AABBCCDDEEFF success=true
```

チャネルを変えて相手が見つからないこと、片側のLMKだけを変えて暗号化ユニキャストが届かないことも確認できます。相手未発見時のブロードキャストと、受信側の待機は自動終了しません。確認後は電源断・リセットで終了します。

## IDF公式サンプルとの確認

IDF側は `examples/wifi/espnow` を使い、menuconfigでStation、同じチャネル・PMK・LMKを設定します。Long RangeとESP-NOW Power Saveは無効にします。IDF側の手順は [公式README](https://github.com/espressif/esp-idf/blob/v6.1/examples/wifi/espnow/README.md) を参照してください。

本サンプルの `protocol.ts` はIDFのpacked構造体に合わせ、type、state、16ビット連番、CRC16、32ビットmagicの順で送ります。CRC計算中はCRC領域を0として扱います。10バイトを超えるpayloadはIDFのランダム値の代わりに0で埋めます。IDF側はpayloadの内容を解釈しません。

IDF側のmagicは起動時に決まるため、両側のログでどちらがユニキャスト送信側になったか確認します。相手を固定するため、本移植例では有効な相手を1台だけ登録し、他の送信元を無視します。知らない相手を自動登録するこの方式は、隔離した2台での診断用です。

## 保証しないこと

公式サンプル同様、アプリ層ACK、再送、重複排除はありません。CRCはデータの検査であり認証ではなく、MAC成功も相手アプリの処理完了を保証しません。命令の信頼性を確認する場合は別レイヤーの `espnow/reliable` を使います。

Long Range、省電力の受信ウィンドウ、AP接続との共存、SoftAPの初期化はこの例の対象外です。coreのAPIは追加・変更していません。復旧は自動で行わず、送信完了通知が失われたら停止して両端末を再起動します。

## ホスト上の検証

リポジトリのルートから実行します。

```sh
node --test examples/network/espnow/idf-peer/tests/*.test.mjs
```

相手発見から宛先切り替えまでの状態遷移、送信中の切り替え、不正パケット、送信失敗、タイムアウトを偽の無線とタイマーで確認します。暗号化そのものを模擬テストで保証するものではありません。

`IDF_PATH` が設定されている場合は、同SDKの `components/esp_rom/linux/esp_rom_crc.c` をホストCコンパイラーでコンパイルし、10・250・1470バイトのヘッダーとCRCを照合します。未設定時はそのテストだけskipします。TypeScriptコンパイラーの `tsc`、CRC照合には `cc` が必要です。
