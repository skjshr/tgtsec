# 会社のWindowsだけで準備する

標的ノートのWindowsを残したまま、会社で検証済みISOの取得、USB検査、USB作成まで
完結させる。ソースを変更する場合だけCodexとGitHub Actionsへ進む。会社LANや会社Wi-Fi
は使わず、個人テザリングだけを使う。

この手順では、ISOが生成されたことと実機で使えることを分けて扱う。Actions成功だけでは当日用USBにしない。

## 1. 完成済みISOを使う最短ルート

このルートはGit、Codex、clone、ローカルビルドを必要としない。PowerShellでUSB作成に
必要な3つだけを導入する。

```powershell
winget install --id GitHub.cli --exact --accept-package-agreements --accept-source-agreements
winget install --id HaraldBoegeholz.h2testw --exact --accept-package-agreements --accept-source-agreements
winget install --id Rufus.Rufus --exact --accept-package-agreements --accept-source-agreements
```

`winget`が見つからない場合は、Microsoft Storeの「アプリ インストーラー」を更新する。
導入後はPowerShellを開き直し、本人がprivate GitHubへログインする。

```powershell
gh auth login --hostname github.com --git-protocol https --web

New-Item -ItemType Directory -Force C:\lab\bootstrap
Set-Location C:\lab\bootstrap
gh release download site-takeover-live-v0.1.0-rc1 `
  --repo skjshr/tgtsec `
  --pattern company-bootstrap.ps1
gh release download site-takeover-live-v0.1.0-rc1 `
  --repo skjshr/tgtsec `
  --pattern USB.md
gh release download site-takeover-live-v0.1.0-rc1 `
  --repo skjshr/tgtsec `
  --pattern DAY-OF.md

.\company-bootstrap.ps1 -SelfTest
.\company-bootstrap.ps1 -DownloadRelease -ConfirmPersonalTether
```

最後のコマンドはdraft/prerelease、対象commit、ISO、SHA-256、BIOS/UEFI記録を照合し、
次へ保存する。

```text
C:\lab\site-takeover-release
```

`SHA-256 verified`と`BIOS and UEFI boot entries are present`の両方が出れば取得合格である。
スクリプトはUSBをフォーマットせず、ISOも書き込まない。

## 2. USBを検査して書き込む

`C:\lab\bootstrap\USB.md`を開き、接続したUSBの物理IDと容量を確認する。現在のBUFFALO
USBは警告歴があるため、H2testwの`all available space`を`Write + Verify`してエラー0件
の場合だけRufusへ進む。Rufusでは次のISOをDDイメージモードで書き込む。

```text
C:\lab\site-takeover-release\site-takeover-live-amd64.iso
```

書き込み後の起動順序とWindowsへの戻し方は`C:\lab\bootstrap\DAY-OF.md`を使う。

## 3. ソースを変更する場合だけcloneする

完成済みISOをそのまま使う場合、この節は不要である。変更が必要な場合だけGitとCodexを
導入し、本人がそれぞれ認証する。

```powershell
winget install --id Git.Git --exact
irm https://chatgpt.com/codex/install.ps1 | iex
```

PowerShellを開き直してから実行する。

```powershell
codex login
Set-Location C:\lab
gh repo clone skjshr/tgtsec
Set-Location tgtsec
git fetch origin
git switch feat/live-usb-b2r
.\labs\site-takeover\operator\company-bootstrap.ps1 -SelfTest
```

privateリポジトリなので、未認証のraw URLから構築資材を取得しない。

## 4. ソースを変える場合だけCodexとActionsを使う

```powershell
Set-Location C:\lab\tgtsec
codex
```

1. Codexには `PROJECT_CONSTITUTION.md`、`DESIGN.md`、`TASK_CONTRACT.md`を先に読ませる。
2. テスト済みの変更だけを作業ブランチへcommitしてpushする。
3. `feat/live-usb-b2r`をpushすると、初回用の`Build Live ISO draft release`が自動で動く。Actions画面で同じcommitの実行を確認する。
4. このworkflowが`main`へ入った後は、Actions画面から作業ブランチとdraft tagを選んで手動実行できる。
5. [GitHubの仕様](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)上、workflow_dispatchはworkflowファイルがdefault branchに存在するまで表示されない。未mergeの段階で手動実行ボタンがないことを失敗と取り違えず、feature branchのpush実行を見る。
6. push実行がない、または失敗した場合は「ISO未生成」と扱い、ActionsログをCodexへ渡して直す。

ローカルの `live/build.sh` が生成する配布物の名前は次の3つである。Actionsとdraft prereleaseも同じ名前を使う。

```text
site-takeover-live-amd64.iso
site-takeover-live-amd64.iso.sha256
site-takeover-live-amd64.boot.txt
```

## 5. USBへ進めるゲート

次の証拠が全て揃った場合だけ [USB.md](USB.md) へ進む。

| 状態 | 必要な証拠 |
|---|---|
| 今回のISO | draft prereleaseの対象commit、ISO、`.iso.sha256`、`.boot.txt`が一致し、SHA-256照合が通る |
| VM検証済み | USB取り外し待ち、ディスク拒否、LAN待ち、Web改ざん、再起動初期化の実測記録がある |
| 配布候補 | private draft prereleaseに上記3ファイルと対象commitが記録されている |
| 再ビルド自動化 | GitHub Actionsの課金/利用上限を直し、今後の変更commitからworkflowを通す。今回の検証済みRCを使うだけなら別ゲート |
| USB合格 | 全容量の書き込み・読み戻し検査がエラー0件である |
| 実機合格 | 対象ノートでUSB起動、SSD非表示、USB取り外し、直結LANを実測している |

未確認の欄を推測で埋めない。古いDebian DVD、Ventoyキット、Actionsの未検証artifactを当日用ISOの代わりにしない。

## 6. 共有Windowsならログアウトする

自分専用ではないWindowsを使った場合は、作業終了後に本人がログアウトする。

```powershell
codex logout
gh auth logout --hostname github.com
```

`C:\lab\tgtsec`を残すか削除するかはPC管理者の方針に従う。スクリプトはログアウトも削除も自動実行しない。
