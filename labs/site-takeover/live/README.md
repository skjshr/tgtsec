# Live ISO build

Debian 13上で次を実行すると、`dist/site-takeover-live-amd64.iso` と
`dist/site-takeover-live-amd64.iso.sha256` を生成します。

```bash
sudo ./build.sh
```

ビルドには`live-build`、`rsync`、`xorriso`と、`/var/tmp`配下に10GiB以上の空きが必要です。生成物はGitへ追加せず、private GitHub Releaseへ添付します。Ubuntuに入る旧版`live-build`ではなく、Debian 13の`live-build`を使います。

起動時は`toram nopersistence`を必須にします。LiveメディアがRAM上へコピーされたことを検査してからUSB取り外しを案内し、物理ディスクが0台になり、有線LANへリンクした場合だけ演習サービスが起動します。
