# Open-world telemetry

Node.js標準ライブラリだけで動く、ローカル教材イベントdaemonである。
`open-world-telemetry.service`は直結Ethernetの`10.13.37.10:8787`へHTTP APIを出し、
Kali BridgeまたはKali loopbackのlocal-only fallback serverだけが利用する。Debianは
public guideを配信せず、telemetry自身も外部クラウドへ送らない。

## Privacy boundary

Unix socketはsystemdが`root:lab-events`、mode `0660`で所有する。senderは
次の6項目をこの順でcanonical JSON化し、source scopeごとのHMAC-SHA-256
`authTag`をwire上だけに加える。

```json
{
  "sessionId": "exercise-2026-07-27-a",
  "kind": "entry.discovered",
  "nodeId": "entrance-web-diagnostics",
  "sourceId": "apache2.service",
  "evidenceCode": "web.diagnostics.opened",
  "occurredAt": "2026-07-27T01:23:45.000Z",
  "authTag": "64 lowercase hexadecimal characters"
}
```

source scopeは固定で、`apache2.service`と`smbd.service`だけが`low`、SSH、
NFSと固定path file watcherは`root`である。daemonはsourceに対応する鍵で
tagを検証し、tagを捨ててから6項目だけをstate engineへ渡す。low鍵で署名した
root source、tagなし、不正tag、余分なkeyは拒否する。その後
`kind + nodeId + sourceId + evidenceCode`を`world-definition.mjs`のallowlistと
照合する。

生コマンド、HTTP parameter、資格情報、鍵、tag、flag内容、ファイル内容、
任意ログはstate/projectionへ保存しない。同じイベントおよび同じ状態への
別イベントはidempotentである。`/root/ROOT.flag`の固定inotify検出を最後の
信頼可能な自動イベントとし、Windows追加flagは手動だけで扱う。
runtimeは`world/flag-verifiers.mjs`の一方向digestだけを読み、平文を持つ
`private-answers.mjs`はbuild専用としてDebian bundleから除外する。全flagは
128-bit以上、Windows flagは192-bitのランダムsuffixを持ち、target上のdigestから
現実的に逆算できない。

senderは接続から応答完了まで1.5秒の絶対deadlineを持ち、daemonがaccept後に
沈黙しても非zeroで終了する。daemon側も各接続を1.5秒で閉じ、同時接続数を64へ
制限する。timeout、oversize、不正JSONを含め、payloadや鍵をログへ出さない。

公開wire shapeは`api-contract.json`を正本とする。未発見nodeはopaqueな
`map-*` IDと`undiscovered`だけを返し、label、detail、hint body、flag ID、
flag正解を返さない。SSEは差分ではなく毎回完全なsanitized projectionを送り、
切断時は`GET /api/session/state`へfallbackできる。

HTTPのstate、SSE、固定hypothesis/hint操作、local manual flag提出はすべて
`Authorization: Bearer`を要求する。tokenはfresh exercise開始時に32 random bytesから生成し、
`/etc/examserver-open-world/session.env`の`TELEMETRY_BRIDGE_TOKEN`へ
`root:lab-telemetry 0640`でsession IDと一緒にatomic保存する。Kaliでは同じ値を
`BRIDGE_TARGET_TOKEN`としてBridgeまたはlocal-only fallback serverへ渡す。tokenをURL、browser、
bundle、plan、log、証跡へ出さない。欠落・不一致はtoken本文を返さず401にする。

Cloud Bridgeが読むのはstate/eventsだけで、cloudから戻せる操作は固定IDのhypothesis選択とhint解除だけ
である。flag文字列はBridge/cloudを通さない。manual flag routeは完全オフライン時のKali
loopback fallback専用で、同じBearer境界の内側に残す。`GET /healthz`だけは状態を含まないliveness
応答としてBearerなしで利用できる。

## Event key provisioning

鍵そのものはrepositoryやimage sourceへ置かない。platformはgolden image構築時に
32 random bytes以上を生成し、daemon起動前に次の所有権で配置する。

```sh
install -d -o root -g root -m 0711 \
  /etc/examserver-open-world/event-keys
umask 077
openssl rand -base64 32 > /etc/examserver-open-world/event-keys/low.key
openssl rand -base64 32 > /etc/examserver-open-world/event-keys/root.key
chown root:lab-events /etc/examserver-open-world/event-keys/low.key
chown root:lab-telemetry /etc/examserver-open-world/event-keys/root.key
chmod 0440 /etc/examserver-open-world/event-keys/low.key
chmod 0440 /etc/examserver-open-world/event-keys/root.key
```

key directoryはlistingを許さず、既知pathのtraverseだけを許す。`www-data`と
固定guest account `nobody`は`lab-events`経由でlow鍵だけを読める。
`lab-telemetry`は両鍵を検証用に読め、root実行のPAMと固定path watcherだけがroot鍵を
読める。鍵は引数、環境変数、ログ、stateへ入れない。pathを変える試験環境だけ
`LAB_EVENT_LOW_KEY_FILE`と`LAB_EVENT_ROOT_KEY_FILE`を使う。

## Automatic detector fallback

daemonとHTTP APIが生きているが、PAM/inotify等の自動detectorを信用できない場合、
運営者はroot所有・mode `0750`で配置したhelperから状態を切り替える。

```sh
sudo /usr/local/sbin/open-world-telemetry-status unavailable
sudo /usr/local/sbin/open-world-telemetry-status live
```

helperはmain processへそれぞれ`SIGUSR1`/`SIGUSR2`を送り、SSEとstate APIを保った
まま手動flag fallbackを開閉する。`unavailable`中もwire認証は行うが、自動eventは
stateへ適用せず、手動提出だけを正本にする。`live`へ戻した後の新しい自動event
から適用を再開する。これはdaemon停止時のfallbackではない。daemonが停止すれば
同じAPIの手動提出も使えないため、operatorはserviceを復旧する。

NFS入口は`open-world-nfs-watch.service`が親directoryのLinux `IN_ACCESS`を監視する。
watcherはsystemdへREADYを返すまでNFSより先に待たれ、署名eventを配信できなければ
異常終了する。NFS unitはwatcherへ`BindsTo`されるため、検出不能のままNFSだけを
公開し続けない。

残る7個の固定教材flagは`open-world-file-watch.service`が各regular fileへ
`IN_ACCESS` watchを登録してからREADYを返す。これはpathごとの固定event tupleだけを送り、
syscall、command line、任意path、file内容を収集・永続化しない。配信失敗やfile差し替えで
非zero終了し、`OnFailure`とvulnerable targetの`BindsTo`が演習surfaceを停止する。

telemetry service/socketも`open-world-vulnerable.target`へ`PartOf`で結び、
exercise targetを停止するとUnix socket、HTTP API、SSEをまとめて停止する。
通常boot targetへ個別にenableせず、platformのexercise targetからだけ起動する。

## Local verification

```sh
cd labs/open-world-target/telemetry
npm test
```

WindowsではLinux inotify試験を理由付きskipする。Ubuntu CIでは通常の`npm test`
内で、実kernel event、production HMAC emitter、production ingest、配信失敗時の
nonzero終了まで実行する。Windows hostから同じ証跡を得る場合はWSLで
`npm run test:nfs-watch:linux`を実行する。

実運用ではplatformがservice user、`lab-events` group、state directory、
鍵、root-only status helper、fresh session/token環境、各fixtureの定数イベントhookを配置する。
開発用起動では`LAB_SESSION_ID`、`TELEMETRY_BRIDGE_TOKEN`、`LAB_STATE_PATH`、
`LAB_EVENT_SOCKET`と2つのkey pathを一時パスへ設定する。
