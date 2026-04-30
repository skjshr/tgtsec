# DISTRIBUTION — 出題者用 配布手順

> このドキュメントは **VM作成者(出題者)** が読むためのものです。

## 概要

完成した CTF VM を OVA としてエクスポートし、チームに配布するまでの流れ。

```
[VM内cleanup] → [シャットダウン] → [ディスク圧縮] → [OVAエクスポート] →
[追加圧縮] → [配布]
```

## ステップ1: VM内クリーンアップ

VM起動状態でターミナルから:

```bash
sudo bash /root/cleanup-before-distribution.sh
```

これで以下が実行される:
- 構築時に追加した`user`の sudo 権限を削除
- `user`アカウントのパスワードロック
- `/home/user/` の個人データ削除 (Claude, codex, npm 等)
- `/root/` の構築用ツール削除
- ログ削除
- shell history クリア

## ステップ2: ディスクを圧縮できる状態にする

OVA を小さくするコツは「未使用領域をゼロ埋めする」こと。

```bash
# VM内で:
sudo dd if=/dev/zero of=/zerofile bs=1M status=progress
sudo rm /zerofile
sync
```

ディスクが満杯になるエラーが出るのは正常 (それが目的)。

## ステップ3: シャットダウン

```bash
sudo shutdown -h now
```

## ステップ4: VirtualBox でディスクをコンパクト化

ホストOS (VirtualBox がある側) のターミナルで:

```bash
# Linux/Mac
VBoxManage modifyhd <vmdk-or-vdi-path> --compact

# Windows
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" modifyhd "<path>" --compact
```

ディスクパスは `~/VirtualBox VMs/<vmname>/<vmname>.vdi` あたり。

## ステップ5: OVA エクスポート

VirtualBox メニュー:
**ファイル → 仮想アプライアンスのエクスポート**

設定:
- ファイル名: `yamamoto-mfg-ctf.ova`
- フォーマット: **OVF 1.0** または **OVA 2.0** (OVA推奨)
- 「すべてのネットワークアダプタ MAC アドレスを書き出す」: **チェック外す**
- 「ISOイメージを含める」: **チェック外す**

エクスポート実行。完成サイズは概ね **2〜4 GB** の範囲。

## ステップ6: 追加圧縮(任意)

OVAをさらに小さくしたい場合:

```bash
xz -9 -T0 yamamoto-mfg-ctf.ova
# → yamamoto-mfg-ctf.ova.xz (大体30%縮む)
```

または:
```bash
7z a -mx=9 yamamoto-mfg-ctf.7z yamamoto-mfg-ctf.ova
```

## ステップ7: 配布

### Option A: GitHub Releases (推奨・2GB以下なら)

```bash
# gh CLI がログイン済みの状態で:
gh release create v1.0 \
  --repo skjshr/tgtsec \
  --title "Yamamoto Mfg. CTF v1.0" \
  --notes "Initial release. See README.md for setup." \
  yamamoto-mfg-ctf.ova
```

Webブラウザでも可能:
1. https://github.com/skjshr/tgtsec/releases/new
2. Tag: `v1.0`
3. Title: `Yamamoto Mfg. CTF v1.0`
4. ファイルをドラッグ&ドロップ
5. **Publish release**

ファイルサイズ上限は **2GB/file**(無償アカウントでも)。

### Option B: 外部ストレージ (2GB超なら)

候補:
- **Google Drive** (15GB無償)
- **Mega.nz** (20GB無償)
- **Dropbox** (2GB無償)
- **WeTransfer** (2GB、7日間)
- **filebin.net** (匿名・期限付き)

リンクを README に追記して push。

### Option C: Git LFS (お勧めしない)

技術的には可能だが、無償枠の帯域(月1GB)を超えると課金されたりリンク切れたり面倒。Releases の方が無難。

## ステップ8: README にダウンロードリンク追記

GitHubの README に以下のような行を追加:

```markdown
## ダウンロード

最新版OVA: [Releases ページ](https://github.com/skjshr/tgtsec/releases) からダウンロード。
SHA256: <ハッシュ値>
```

ハッシュは:
```bash
sha256sum yamamoto-mfg-ctf.ova
```

## ステップ9: チームに通知

リポジトリのリンク + Releases のリンクをSlack/Discord/メール等で共有。

```
山本製作所 CTF 配布開始!

📁 セットアップ手順 + ヒント: https://github.com/skjshr/tgtsec
📦 VMダウンロード: https://github.com/skjshr/tgtsec/releases/latest

  - 形式: Boot2Root
  - 想定時間: 2-4時間
  - フラグ3個 (TSHL{...})

がんばって!
```

## アップデート手順 (バグ修正があった場合)

1. VMを修正
2. cleanup → shutdown → compact → export を再実行
3. `gh release create v1.1 ...` で新Release
4. README更新が必要なら push

## チェックリスト(配布前最終確認)

- [ ] `sudo bash /root/cleanup-before-distribution.sh` 実行済み
- [ ] /home/user/.claude などの個人データ全削除
- [ ] フラグ3個が正しく配置されている (`/var/www/.flag1.txt`, `/home/yamamoto/user.txt`, `/root/root.txt`)
- [ ] Drupalgeddon2 PoC が動作する(自分でend-to-end走らせて確認)
- [ ] sudo find privesc が動作する
- [ ] ネットワーク設定がまずデフォで NAT または Host-Only(プレイヤーが設定変える)
- [ ] OVA エクスポートが正常完了
- [ ] SHA256 ハッシュ計算済み
- [ ] Release 作成済み or 外部リンク準備済み
