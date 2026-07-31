# 風切モータース target world

このディレクトリは、演習専用の架空企業「風切モータース」の世界定義と
Debianへ配置する静的fixtureだけを所有する。実在の企業、人物、顧客情報、
資格情報は含まない。

## 世界の契約

- 入口はWeb診断、匿名SMB引き継ぎ共有、NFS所有権対応の3つ。
- footholdは`www-data`、`sales`、`mechanic`の3つ。
- どのfootholdからもsudo hook、root timer、SUID PATHの3経路を選べる。
- flagsは入口3、foothold 3、root手掛かり3、root経路3、共通root 1の
  Debian内計13個。
- 既知CVE、ブルートフォース、マルウェア、永続化、外部ネットワークを使わない。

`world-definition.mjs`が内部の正本であり、ブラウザへ直接配信してはいけない。
公開sourceはflagのID、配置先、権限だけを持ち、flag本文、verifier、seedを持たない。
`materialize-flags.mjs`はtarget bundleの新しいstaging rootごとにOSの
暗号学的乱数から192-bitのsuffixを生成し、13個の配置先へだけ書く。本文を返り値、
標準出力、manifest、telemetryへ載せず、既存ファイルは上書きしない。進行は
allowlist済み自動eventが正本であり、flag提出やverifierへ依存しない。

## 検証とflag配置

```sh
node labs/open-world-target/world/validate-world.mjs
node labs/open-world-target/world/materialize-flags.mjs /absolute/staging/root
```

validatorはDebian runtimeでも安全な構造だけを検査する。
`materialize-flags.mjs`は相対パスとfilesystem rootを拒否し、生成した全13本文の
形式と一意性を確認してから、staging root内のDebian配置先へだけ新規作成する。
通常は直接実行せず、platformのtarget bundle構築から呼ぶ。

SMB経路の`/srv/kazekiri/handover/SHIFT-HANDOVER.txt`も公開sourceではplaceholder
だけを持つ。platformは同じbuildでsales用資格情報を生成し、handoverと
`installer-private`へだけ配置する。

`fixtures/rootfs`は設定例であり、単独では有効化しない。実機への所有者、
group、package、unit有効化、ネットワーク隔離はplatformの構築工程が担当する。
