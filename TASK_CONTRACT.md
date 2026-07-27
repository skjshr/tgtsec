# Task Contract: Live USB Web Site Takeover Lab v2

## Goal

1〜3人のIT完全初心者が90分の技術部会で、Live USBから起動した実機Webサーバへ直結LANで侵入し、トップページを自分のチーム名へ書き換え、その因果を説明できる教材を作る。

## Inputs

- Target: Windowsとデータを残す8GB RAMノートPC、Ethernetあり、UEFIで内蔵SSDを無効化でき、BitLocker回復手段を本人が確認済み
- Attacker: Kali入り借用PC、またはKali VMを動かす自分のPC
- Network: 2台をLANケーブルで直結
- Session: 90分、参加者1〜3人、IT/ターミナル未経験
- Media: 64GB BUFFALO USB、現状はexFATの`Full Repair Needed`。全容量検査でエラー0件の場合だけ採用
- Build station: 標的ノートのWindows、個人テザリング、GitHub CLI、Codex CLI

## Removals and rejected alternatives

- 山本製作所/Drupal/既存OVAはv2の素材にせず、比較用の旧教材として凍結する。
- DVWAは脆弱性名を先に選ぶ構造が今回の発見体験と合わないため採用しない。
- 受付PCやサイネージ設定は、CLI実機との説明差が増えるため採用しない。
- ターゲットのデスクトップGUIは、故障点と再構築時間を増やすため採用しない。
- Debian DVDによるクリーンインストール、SSD分割、デュアルブートはWindows保護と再構築時間に反するため採用しない。
- Ventoyによる複数ISO運用は、起動時の選択と書き換え可能なデータ領域を増やすため採用しない。
- GitHub Pagesは借用PCと回線に依存するため、演習中の必須経路にしない。
- 侵入後のcleanupスクリプトや永続領域は信頼できる初期化にならないため、リセット手段にしない。
- root取得は初回の必須ゴールにしない。

## Constraints

- 演習サービスはターゲットの直結Ethernetでだけ公開する。
- Live OSは`toram nopersistence`で起動し、USBを抜いた後にだけ演習を開始する。
- 内蔵SSDまたは外付けディスクが見える場合は、脆弱サービスをfail closedで起動しない。
- 演習中はWi-Fi、DNS、デフォルトルート、外部接続を無効にする。
- Codex CLIは保守モードだけで使用し、認証情報と履歴を再起動後へ残さない。
- 脆弱性は教材コード内に限定し、第三者製品の古い脆弱版へ依存しない。
- ターゲットへ個人情報、会社情報、本物の資格情報を置かない。
- 参加者向けガイドにoperator用の完全解答、root秘密、保守認証情報を含めない。
- GitHub、Codex、SSHの認証情報をLive ISOへ含めない。
- USBへ書き込む前に全容量の読み書き検査を行い、ISOのSHA-256を照合する。

## Done criteria

- ターゲットサイト、段階型ガイド、意図したコマンドインジェクションを実装する。
- 限定ユーザーでトップページの「お知らせ」を書き換えられる。
- 限定ユーザーでダミーの非公開メモを読める。
- ボーナス経路で管理者権限の証拠を取得できる。
- Debian Live ISOを一つの構築コマンドとGitHub Actionsの両方から再現できる。
- ディスクなし環境では起動し、物理ディスクが見える環境では演習サービスを拒否する。
- exercise/maintenanceのモード切替と、exercise状態の外部経路遮断を自動確認できる。
- 借用Kali向けにUSB不要の事前確認表を用意する。
- Firefoxで参加者フローをE2E確認し、デスクトップと狭幅のスクリーンショットを残す。
- 会社のWindowsだけでclone、Codex修正、Actionsビルド、ISO取得、USB作成を完了できる。
- USB検査、Live起動、USB取り外し、終了後の再起動をoperator文書へ残す。
- privateブランチ、draft PR、検証済みdraft prereleaseをGitHubへ作る。

## Surprise ledger

- USBの主用途をOVA保管やOS再インストールから、読み取り専用Live OSの起動へ変更する。
- 演習ガイドもターゲットPC内から配信し、当日のインターネット依存をなくす。
- v2は既存リポジトリ内の独立した`labs/site-takeover`として追加し、旧教材を上書きしない。
- 標的ノートのWindowsを会社での開発・USB作成環境として残す。
- workflow_dispatchがdefault branchへ入る前は表示されないため、未mergeの初回だけ`feat/live-usb-b2r`へのpushでdraft prereleaseビルドを起動する。
