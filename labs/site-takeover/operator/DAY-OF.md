# 当日の進め方

参加者が最初にすることは、Kaliのブラウザで店のWebサイトを見ること。USB起動、物理ディスク拒否、直結LANは、参加者が来る30分前に運営担当が実測する。

## 開始前の合格条件

- [USB.md](USB.md)の物理検証記録に、USB全容量検査とISO SHA-256のPASSがある
- 標的ノートのWindows、SSD、パーティションを変更していない
- BitLockerが有効なら回復キーへアクセスでき、UEFI変更前に保護を一時停止している
- Kaliは [KALI-PREFLIGHT.md](KALI-PREFLIGHT.md) の「ケーブルを挿す前」まで完了している
- 会社LAN、会社Wi-Fi、VPN、外付けディスクが2台から外れている

空欄や未実測をPASSとして扱わない。

### WindowsとBitLockerを保護する

最初の実機試験では、Windowsを終了する前に管理者PowerShellで状態を確認する。

```powershell
Get-BitLockerVolume -MountPoint C:
```

`ProtectionStatus`が`On`なら、回復キーへ本人がアクセスできることを先に確認し、今回のUEFI変更中だけ保護を一時停止する。

```powershell
Suspend-BitLocker -MountPoint C: -RebootCount 2
```

この扱いはMicrosoftの
[BitLocker保護の一時停止手順](https://learn.microsoft.com/en-us/troubleshoot/windows-client/windows-security/suspend-bitlocker-protection-non-microsoft-updates)
に従う。一時停止は復号ではないが、Windowsへ戻ったら必ず再開する。

回復キーがない、会社の方針で一時停止できない、または内蔵SSDを無効化する項目がUEFIにない場合は、実機試験を開始しない。ディスク安全ゲートを弱めて代用しない。

## Live USBから演習開始まで

順番を変えない。標的はLANケーブルがつながるまで演習開始状態にならない。

1. 標的ノートをWindowsから完全に終了する。
2. LANケーブルと外付けディスクを外したまま、UEFIで内蔵SSDを無効化する。
3. Live USBを挿し、Debianの起動画面で `Live system (amd64)` を選ぶ。
4. `REMOVE USB`（USBを抜く）が表示されるまで待つ。
5. Live USBを物理的に抜く。USBが残っている間は先へ進まない。
6. `CONNECT LAN`（LANを接続）が表示されたら、ここで初めてKaliとのLANケーブルを挿す。
7. `EXERCISE READY`（演習開始）と `10.13.37.10` が表示されるまで待つ。
8. Kaliで事前確認の残りを実行し、サイトとガイドを別タブで開く。

```text
http://10.13.37.10/
http://10.13.37.10/start/
```

`BLOCKED`、物理ディスク一覧、USB取り外し失敗のいずれかが出たら、演習サービスは停止したままである。USBやディスクを挿して解除せず、電源を終了してUEFI設定から確認する。

署名済みISOでも機種固有のUEFI設定で起動を拒否される場合がある。BitLocker回復キーを確認せずSecure Bootを変更しない。変更が必要なら実機検証項目として別日に扱う。

参加者へ見せるのはKaliだけ。標的ノートのキーボードは運営担当だけが触る。

## 最初の説明

> 右のノートPCで小さな店のWebサイトが動いています。右のPCには触らず、Kaliだけを使って、トップページの「本日のお知らせ」を自分たちのチーム名へ変えてください。触ってよいのはこの2台だけです。迷ったらガイドで次に知りたいことを選んでください。

コマンドインジェクションやrootという言葉は最初に教えない。店のサイトが変わるまでは、参加者が見た事実を言葉にする手助けだけをする。

## 90分の配分

| 時間 | やること |
|---|---|
| 0〜10分 | 触ってよい範囲とゴールを共有し、店のサイトを見る |
| 10〜25分 | 相手PCの入口と、公開されていない管理ページを探す |
| 25〜50分 | 入力欄からOSの利用者名と置き場所を調べる |
| 50〜65分 | チーム名を書き込み、トップページを再読み込みする |
| 65〜75分 | 入力、シェル、限定利用者、元データの関係を説明する |
| 75〜85分 | 余裕があれば非公開メモか管理者権限へ進む |
| 85〜90分 | 参加者自身の言葉で何が起きたか話してもらう |

50分時点で管理ページに届いていなければ、ガイドの3段階目のヒントを開く。必須ゴールを飛ばしてrootへ進めない。

## 標的上のCodexで故障を調べる

これは参加者向けヒントではなく、Webサービス自体が壊れた場合の運営用保守モードである。
演習中のままテザリングへつながない。

1. 参加者の操作を止め、標的とKaliのLANケーブルを抜く。
2. 標的コンソールで`sudo lab-mode maintenance`を実行する。
3. `MAINTENANCE`と`Lab services are OFF`を確認する。
4. `sudo nmtui`で、本人の個人テザリングだけへ接続する。
5. 初回だけ`codex-maintenance login --device-auth`を実行し、表示された本人確認を別端末のブラウザで完了する。
6. `cd /srv/shop-site`、`codex-maintenance`の順に実行して、実行中の一時コピーを読み取り調査する。rootでは起動しない。終了はCodex内の終了操作か`Ctrl+C`を使う。
7. テザリング接続を`sudo nmtui`で切り、`nmcli radio wifi off`を実行する。
8. 標的とKaliの直結LANだけを挿し直す。
9. `sudo lab-mode exercise`を実行し、表示されるpreflightが全て`PASS`になり、`EXERCISE READY`へ戻ることを確認する。

Codexの認証、履歴、作業領域は`/run`だけを使い、exerciseへ戻る処理がCodexの
プロセスと認証領域を削除する。`/srv/shop-site`への変更も初期状態から作り直すため、
お知らせと参加者ガイドの進捗は0へ戻る。恒久修正は標的上で行わず、会社Windowsの
Gitリポジトリへ反映して新しいISOを作る。

## 詰まったとき

### どちらのページも開かない

1. 標的画面が `EXERCISE READY` のままか確認する。
2. LAN端子のリンクランプを見る。
3. Kaliで `ip -br address` と `ip -4 route show default` を見る。
4. Kaliに `10.13.37.x` が付かない場合だけ、事前確認表の固定IPへ切り替える。

### 店のサイトだけ開く

ガイドは同じWebサーバの `/start/` にある。

```text
http://10.13.37.10/start/
```

### 結果を貼っても先へ進まない

実行したコマンドと、その直後の出力をまとめて貼る。プロンプトの1行だけでは判定できない。ガイドが示す「確認する行」をもう一度見る。

### 参加者がターミナルで止まる

運営担当が代わりに入力しない。「いま知りたいのは入口、利用者、置き場所のどれか」と聞き、本人にガイドの選択肢を選んでもらう。貼り付け方法だけは教えてよい。

## 終了してWindowsへ戻す

順番を変えない。SSDを無効のままWindowsを起動しようとしない。

1. LANケーブルを抜く。
2. 運営担当が標的コンソールで `sudo poweroff` を実行し、電源が切れるまで待つ。
3. Live USBが抜けていることを確認する。
4. 標的をUEFIへ起動し、内蔵SSDを再び有効化する。
5. UEFI設定を保存して再起動する。
6. Windowsが通常どおり起動することを確認する。
7. BitLockerを一時停止した場合は、管理者PowerShellで `Resume-BitLocker -MountPoint C:` を実行し、`ProtectionStatus`が`On`へ戻ったことを確認する。
8. 借用Kaliに固定IPを作った場合は、事前確認表の削除手順を実行する。

お知らせだけを戻す片付け操作は行わない。Live OSの電源終了を初期化とし、次回はSSDを再び無効化してLive USBから起動する。
