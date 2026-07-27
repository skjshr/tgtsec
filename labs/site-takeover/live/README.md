# Live ISO build

Debian 13の一時ビルド環境でだけ実行します。必要なパッケージを導入します。

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates git live-build rsync wget xorriso
```

リポジトリのルートから次を実行します。

```bash
sudo ./labs/site-takeover/live/build.sh
```

次の4ファイルを生成します。

```text
labs/site-takeover/live/dist/site-takeover-live-amd64.iso
labs/site-takeover/live/dist/site-takeover-live-amd64.iso.sha256
labs/site-takeover/live/dist/site-takeover-live-amd64.boot.txt
labs/site-takeover/live/dist/build.log
```

同じディレクトリでSHA-256を照合します。

```bash
cd labs/site-takeover/live/dist
sha256sum --check site-takeover-live-amd64.iso.sha256
grep -E 'BIOS|UEFI' site-takeover-live-amd64.boot.txt
```

ビルドには`/var/tmp`配下に10GiB以上の空きが必要です。生成物はGitへ追加しません。
Ubuntuに入る旧版`live-build`やWindows上の代替手順ではなく、Debian 13の
`live-build`を使います。ISOが生成できても、VMと物理環境の検証が終わるまでは
配布候補にしません。

起動時は`toram nopersistence`を必須にします。LiveメディアがRAM上へコピーされたことを検査してからUSB取り外しを案内し、物理ディスクが0台になり、有線LANへリンクした場合だけ演習サービスが起動します。
