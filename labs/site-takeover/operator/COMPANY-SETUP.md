# 会社のWindowsだけで準備する

標的ノートのWindowsを残したまま、会社で検証済みISOの取得、USB検査、USB作成まで
完結させる。ソースを変更する場合だけCodexとGitHub Actionsへ進む。会社LANや会社Wi-Fi
は使わず、個人テザリングだけを使う。

この手順では、ISOが生成されたことと実機で使えることを分けて扱う。Actions成功だけでは当日用USBにしない。

## 1. リポジトリがないWindowsを準備する

`company-bootstrap.ps1`はprivateリポジトリ内にあるため、最初のcloneより前には使えない。最初だけPowerShellで直接導入する。

```powershell
winget install --id Git.Git --exact
winget install --id GitHub.cli --exact
irm https://chatgpt.com/codex/install.ps1 | iex
```

`winget`が見つからない場合は、Microsoft Storeの「アプリ インストーラー」を更新してからやり直す。導入後はPowerShellを開き直す。

```powershell
git --version
gh --version
codex --version
```

## 2. 本人が認証してcloneする

GitHubとCodexは別々の認証である。次の操作は本人がブラウザ画面を確認して行う。

```powershell
gh auth login --hostname github.com --git-protocol https --web
codex login

New-Item -ItemType Directory -Force C:\lab
Set-Location C:\lab
gh repo clone skjshr/tgtsec
Set-Location tgtsec
git fetch origin
git switch feat/live-usb-b2r
```

privateリポジトリなので、未認証のraw URLからスクリプトだけを取得する手順にはしない。`git switch`でブランチが見つからなければ、Live USB版はまだGitHubへ届いていないため、そこで止める。

clone後に、非破壊の自己テストと現在状態の確認を行う。

```powershell
.\labs\site-takeover\operator\company-bootstrap.ps1 -SelfTest
.\labs\site-takeover\operator\company-bootstrap.ps1
```

以後ツールが不足した場合だけ、個人テザリングを目視確認して明示的に導入する。

```powershell
.\labs\site-takeover\operator\company-bootstrap.ps1 `
  -Install `
  -ConfirmPersonalTether
```

このスクリプトは認証、clone、USB修復、フォーマット、ISO書き込みを行わない。

## 3. 今日そのまま使うISOを取得する

通常は再ビルドせず、検証済みのdraft prereleaseを取得する。個人テザリングを目視確認して
次を実行する。

```powershell
.\labs\site-takeover\operator\company-bootstrap.ps1 `
  -DownloadRelease `
  -ConfirmPersonalTether
```

このモードは、draft/prerelease、対象commit、3成果物、SHA-256、BIOS/UEFI記録を確認し、
次へ保存する。

```text
C:\lab\site-takeover-release
```

`SHA-256 verified`と`BIOS and UEFI boot entries are present`の両方が出た場合だけ
[USB.md](USB.md)へ進む。スクリプトはUSBをフォーマットせず、ISOも書き込まない。

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
| ISO生成済み | 対象commitのActionsが成功し、ISO、`.iso.sha256`、`.boot.txt`を取得できる |
| VM検証済み | USB取り外し待ち、ディスク拒否、LAN待ち、Web改ざん、再起動初期化の実測記録がある |
| 配布候補 | private draft prereleaseに上記3ファイルと対象commitが記録されている |
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
