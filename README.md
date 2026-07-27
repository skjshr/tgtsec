# tgtsec training targets

このprivateリポジトリは、許可された隔離環境だけで使うセキュリティ教材の正本です。

## Current: Site Takeover Live USB

技術部会向けの現行教材は [`labs/site-takeover`](labs/site-takeover/README.md) です。

- 標的ノートのWindowsと内蔵SSDを消去しない
- 専用USBから`toram nopersistence`でRAM起動する
- USBと物理ディスクが見えない場合だけ脆弱Webサービスを開始する
- Kaliと直結したEthernetだけで完結する
- 初心者の必須ゴールは、店のトップページを自分たちの名前へ書き換えること
- 非公開メモと管理者権限は任意のボーナス

会社のWindowsだけで準備する場合は、最初に
[`COMPANY-SETUP.md`](labs/site-takeover/operator/COMPANY-SETUP.md)を読みます。ISOを生成しただけでは当日用にせず、VM、USB全容量、対象ノートの順に検証します。

```text
会社Windows + 個人テザリング
  -> private GitHubへpush
  -> 手動ActionsでLive ISOをビルド
  -> draft prereleaseからISOとSHA-256を取得
  -> USB全容量検査
  -> Rufusで書き込み
  -> 対象ノートで実機検証
```

設計上の約束は [`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md)、
見た目と教材体験は [`DESIGN.md`](DESIGN.md)、現在の完了条件は
[`TASK_CONTRACT.md`](TASK_CONTRACT.md)に分けています。

## Legacy: Yamamoto Mfg. OVA

山本製作所を題材にした旧OVA教材は、現行Live USB教材とは別物です。既存OVAを使う場合だけ、次の旧文書を参照します。

- [`SETUP.md`](SETUP.md) — VirtualBoxへのOVA導入
- [`PRIMER.md`](PRIMER.md) — 初参加者向け基礎
- [`WALKTHROUGH-BEGINNER.md`](WALKTHROUGH-BEGINNER.md) — 段階的ヒント
- [`TOOLS-CHEATSHEET.md`](TOOLS-CHEATSHEET.md) — コマンド一覧
- [`DISTRIBUTION.md`](DISTRIBUTION.md) — OVA配布手順

旧OVAを物理SSDへ変換したり、現行Live USBの代用品にしたりしません。

## 共通ルール

- 攻撃対象は、その回に運営担当が指定した標的だけ
- 会社LAN、インターネット、第三者のIPを調査しない
- 認証情報、個人情報、会社情報を標的へ置かない
- 失敗した安全検査を無効化して続行しない
