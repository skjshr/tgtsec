# Operator runbook

運営者は「準備」「演習」「復旧」を同じboot sessionで続けません。root取得後のDebianは信頼せず、
次回利用前に外部の信頼済み復旧USBから戻します。

読む順序:

1. [PREPARE-TARGET.md](PREPARE-TARGET.md) — 専用Debian、profile、platform/target bundle、recovery kit
2. [PACKAGE-BOOTSTRAP.md](PACKAGE-BOOTSTRAP.md) — clean installのpackage導入
3. [CODEX-BOOTSTRAP.md](CODEX-BOOTSTRAP.md) — public GitHubとCodexを使うpinned再構築手順
4. [DAY-OF.md](DAY-OF.md) — Kali/target preflight、mode遷移、停止条件
5. [RECOVERY.md](RECOVERY.md) — Debian通常復旧、full-disk fallback
6. [PHYSICAL-VERIFICATION.md](PHYSICAL-VERIFICATION.md) — 9経路と実機証跡

本プロジェクトの目標はデモではなく完成品です。完成とは、Debianを再構築できること、
Kali上のFirefoxでライブ攻略を運用できること、root取得後に復旧できることの3点が
別のoperatorでも再現できる状態を指します。自動testや画面だけの成功では完成扱いにしません。

現時点ではsoftware contractだけが実装済みです。`evidence.example.json`のphysical gateはすべて
`not-run`であり、対象ノート上のexploit、Kali連携、restoreを完了扱いにしません。
演習中のguide正規入口は`https://exam-server-one.vercel.app/lab`です。
Kali Bridgeが表示する短期pairing codeで接続します。攻撃対象は
raw IP `10.13.37.10`、telemetryは`http://10.13.37.10:8787`です。完全オフライン時だけ
Kali loopbackの`http://127.0.0.1:8080/?local=1`を使い、Debianへguideを導入しません。

install、target install、mode、preflightは対象Debianのlive identityが`ID=debian`、`VERSION_ID=13`、
`dpkg --print-architecture`が`amd64`、`uname -m`が`x86_64`であるときだけ進めます。recovery USBは
この対象identityと別の、信頼済み互換Linuxで構いません。
