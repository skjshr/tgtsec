# ExamServer 実践ラボ

許可された直結環境だけで使う、初心者向けオープンワールド型セキュリティ教材です。

標的はWindowsとDebian 13をデュアルブートするノートPCです。参加者はKali実機、または専用Ethernetだけを割り当てたKali VMから接続し、架空の中古バイク販売・整備チェーン「風切モータース」の業務サーバを調べます。

公開ガイド: <https://exam-server-one.vercel.app/lab>

## 体験

- 3つの入口から低権限のLinux footholdを得る
- 発見した事実をExamServerの`/lab`にある探索地図でつなぐ
- 状況に合う仮説を選び、必要時だけ段階ヒントを見る
- 3つの異なる権限昇格経路からDebian本体のrootを取る
- 別セッションでは別ルートと14個のflagを探索する

標準の一経路は初心者が30〜60分で完走できる密度にします。公開Webは標的がなくても閲覧でき、演習中はKali Bridgeが許可済み教材イベントだけを送って地図、説明、次の選択をリアルタイムに更新します。生コマンド、端末出力、資格情報、flag文字列はクラウドへ送りません。

初期画面に出すのは現在目標、探索地図または仮説、主要操作だけです。接続、確定した事実、調査やヒント、履歴は件数付きの引き手に収納し、学習者が選んだ一種類だけをdesktopではside drawer、スマートフォンではbottom sheetで開きます。ライブ更新も勝手にパネルを開かず、目標、地図、引き手の件数だけを変えます。

## 構成

- `apps/lab-guide` — 探索地図と状況相談
- `apps/lab-guide/cloud` — Vercel FunctionとUpstash Redisによるペアリングとライブ投影
- `labs/open-world-target/world` — 架空業務環境、意図的脆弱性、flags
- `labs/open-world-target/telemetry` — 教材イベント、状態遷移、ローカルAPI
- `labs/open-world-target/bridge` — Kaliから`/api/lab`への外向き中継
- `labs/open-world-target/platform` — Debian構築、exercise/maintenance、復旧
- `labs/open-world-target/operator` — 準備、当日運用、実機検証
- `docs/design` — 承認済み画面正本

設計判断は [`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md)、画面契約は
[`DESIGN.md`](DESIGN.md)、完了条件は [`TASK_CONTRACT.md`](TASK_CONTRACT.md) が所有します。

## ローカル確認

Node.js 20以上とPython 3.11以上を使います。ガイドの依存関係を一度入れれば、UI、14 flags、
9経路、テレメトリ、Debian制御、復旧kitをまとめて検証できます。

```text
npm ci --prefix apps/lab-guide
npm run check
```

開発用ガイドは自動状態のfixture付きで起動できます。

```text
npm --prefix apps/lab-guide run dev -- --host 127.0.0.1 --port 4173
```

ブラウザで`http://127.0.0.1:4173/?fixture=live`を開きます。`empty`、`reconnecting`、
`unavailable`、`success`でも主要状態を再現できます。`transition`は、再読込なしで
接続確認から最初の発見へ変わる状態を再現します。標的への導入順と実機gateは
[`labs/open-world-target/operator/PREPARE-TARGET.md`](labs/open-world-target/operator/PREPARE-TARGET.md)
から始めます。

実機演習のガイド入口は
<https://exam-server-one.vercel.app/lab> です。`BRIDGE_CLOUD_ORIGIN`には
`https://exam-server-one.vercel.app`を設定します。Kali Bridgeを起動し、表示された短期pairing
codeを公開ガイドへ入力します。
攻撃対象は常にraw IP `10.13.37.10`、Bridgeが読むtelemetryは
`http://10.13.37.10:8787`です。Debianはガイドを配信せず、DNS resolverも広告しません。

インターネットを使わない演習だけは、Kali上でlocal-only fallback serverをloopbackへ起動し、
`http://127.0.0.1:8080/?local=1`を開きます。fallback serverやガイド成果物をDebianへcopyしません。
ライブ連携の責務と保存しない情報は
[`docs/LIVE_ARCHITECTURE.md`](docs/LIVE_ARCHITECTURE.md)にまとめています。

## 安全境界

- 攻撃対象は運営者が指定した標的ノートだけ
- exercise modeは直結Ethernet以外の経路を持たない
- 実在データ、実アカウント、実資格情報を標的へ置かない
- root取得後のDebianを信頼せず、外部の信頼済み復旧USBから初期化する
- Windowsは空の捨て環境とし、裏flag以外の価値あるデータを置かない
- ディスク操作は機種、disk ID、partition UUID、image hash、確認語が一致しない限り実行しない

## 現在の検証境界

リポジトリ内ではUI、状態エンジン、構築資材、fail-closed制御を自動検証します。公開
`/lab`と`/api/lab`は、`create → pair → replay拒否 → waiting → snapshot → live → SSE`
の本番smokeを公開ごとに通します。次の項目は対象ノートで証跡を残すまで未完了です。

- Windowsを保持したDebianデュアルブート導入
- Kali実機とKali VMからの9経路攻略
- exercise modeの物理NIC隔離
- root取得後の復旧USB初期化
- DebianとWindowsの再起動
