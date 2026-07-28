# 風切モータース target world

このディレクトリは、演習専用の架空企業「風切モータース」の世界定義と
Debianへ配置する静的fixtureだけを所有する。実在の企業、人物、顧客情報、
資格情報は含まない。

## 世界の契約

- 入口はWeb診断、匿名SMB引き継ぎ共有、NFS所有権対応の3つ。
- footholdは`www-data`、`sales`、`mechanic`の3つ。
- どのfootholdからもsudo hook、root timer、SUID PATHの3経路を選べる。
- flagsは入口3、foothold 3、root手掛かり3、root経路3、共通root 1、
  Windows追加flag 1の計14個。
- 既知CVE、ブルートフォース、マルウェア、永続化、外部ネットワークを使わない。

`world-definition.mjs`が内部の正本であり、ブラウザへ直接配信してはいけない。
`private-answers.mjs`はgolden imageを作るbuild hostだけが読み、Debian targetへ
コピーしてはいけない。telemetry daemonは`flag-verifiers.mjs`のSHA-256 verifier
だけを使う。全flagは128-bit以上、Windows flagは192-bitの暗号学的ランダムsuffix
を持ち、Debianへ置くdigestからの総当たりを現実的にしない。公開APIは
`telemetry`のprojectionを通す。

## 検証とflag配置

```sh
node labs/open-world-target/world/validate-world.mjs
node labs/open-world-target/world/validate-private-answers.mjs
node labs/open-world-target/world/materialize-flags.mjs /absolute/staging/root
```

最初のvalidatorはDebian runtimeでも安全な構造検査、2つ目はbuild hostだけで
平文とverifierの対応、全14 suffixの128-bit以上の長さと一意性を検査する。
`materialize-flags.mjs`は相対パスとfilesystem rootを拒否し、既存ファイルを
既定で上書きしない。`--force`はgolden imageを再生成する明示的な構築工程で
だけ使う。Windows用flagはstaging root内の`windows-fixture/`へ生成され、
Debianのexercise modeからWindowsを書き換える処理はここには置かない。

`fixtures/rootfs`は設定例であり、単独では有効化しない。実機への所有者、
group、package、unit有効化、ネットワーク隔離はplatformの構築工程が担当する。
