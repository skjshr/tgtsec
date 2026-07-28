# Kali Bridge

Kali から直結した Debian 標的の公開状態を読み取り、examserver 側へ中継する
Node.js 20+ のプロセスです。標的へシェルや任意コマンドを送る機能はありません。

## 設定

必須:

- `BRIDGE_CLOUD_ORIGIN`: examserver Bridge API の origin。通常は HTTPS。
- `BRIDGE_DEPLOYMENT_TOKEN`: セッション作成専用の deployment secret。
- `BRIDGE_TARGET_TOKEN`: Debian telemetry が
  `TELEMETRY_BRIDGE_TOKEN` で検証する標的専用 secret。

任意:

- `BRIDGE_TARGET_ORIGIN`: Debian telemetry API の origin。既定値は
  `http://10.13.37.10:8787`。誤設定でtokenを外部hostへ送らないよう、
  hostは`10.13.37.10`またはloopbackだけを受け付けます。
- `BRIDGE_ACTION_POLL_MS`: cloud action のポーリング間隔。既定値は 1000 ms。
- `BRIDGE_HEARTBEAT_MS`: snapshot heartbeat 間隔。既定値は 10000 ms。
- `BRIDGE_REQUEST_TIMEOUT_MS`: JSON API のタイムアウト。既定値は 5000 ms。
- `BRIDGE_SSE_IDLE_TIMEOUT_MS`: SSE 無通信タイムアウト。既定値は 25000 ms。
- `BRIDGE_RECONNECT_BASE_MS`: 再接続 backoff の初期値。既定値は 500 ms。
- `BRIDGE_RECONNECT_MAX_MS`: 再接続 backoff の上限。既定値は 30000 ms。

cloud origin は loopback 開発時を除いて HTTPS が必須です。token はどちらも
32–512文字の可視・非空白文字列として環境変数だけから読み取り、標準出力へは
出しません。

## 起動

```sh
npm start
```

セッション作成後、標準出力には pairing code と viewer URL の2行だけが表示されます。
停止は `SIGINT` または `SIGTERM` で行います。

## 境界

- 標的への state、SSE、hypothesis、hint の全リクエストで
  `Authorization: Bearer <BRIDGE_TARGET_TOKEN>` を送信。
- 標的から取得するのは `/api/session/state` と `/api/session/events` の公開 projection。
- cloud へ送るのは検証済みの full projection、action acknowledgement、heartbeat。
- cloud から受け付ける操作は `selectHypothesis` と `unlockHint` のみ。
- 操作先は ID を検証して組み立てる固定 API path のみ。
- Bridge は標的にローカル flag API が存在しても呼び出しません。flag 送信、任意
  path、資格情報の中継、コマンド実行は扱いません。
- revision の巻き戻りと、同一 revision で内容が変わる snapshot は拒否します。
- target SSE、cloud snapshot、action pollの一時障害は上限付き指数backoffで再試行します。

## 検証

```sh
npm test
```

このテストは設定、projection 境界、revision 競合、SSE 再接続判断、固定 action
path、secret-safe error、および中継 orchestration をローカルで検証します。実際の
Debian 標的および cloud deployment への接続確認は別の統合ゲートです。
