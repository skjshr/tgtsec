# SETUP — プレイヤー向けセットアップ手順

> このドキュメントは **VM(攻撃対象)を受け取った側** が読むためのものです。

## 必要なもの

- **VirtualBox** (7.x以上推奨) — https://www.virtualbox.org/
- **攻撃用VM** — Kali Linux または Parrot OS を別途用意
- **ターゲットVM (OVA)** — 配布物 `yamamoto-mfg-ctf.ova`(別途共有された場所からダウンロード)
- ホストOSに **8GB以上のRAM** と **20GB以上の空き** があると快適

## ステップ1: ターゲットVMをインポート

1. VirtualBox を起動
2. メニュー **ファイル → 仮想アプライアンスのインポート**
3. ダウンロードした `yamamoto-mfg-ctf.ova` を選択
4. 設定確認画面で **MACアドレスポリシー** を `すべてのネットワークアダプタ MAC アドレスを再生成する` にする(複数人で同時起動するとMAC衝突する場合があるので)
5. インポート実行

## ステップ2: ネットワーク設定 — Host-Only にする

ターゲットVMと攻撃用VMが**お互いに通信**できる必要があります。

### Host-Only Network 作成 (初回のみ)

VirtualBox → **ファイル → ツール → ネットワークマネージャー** → **作成** ボタン

通常 `vboxnet0` (192.168.56.0/24) が作られます。DHCP有効でOK。

### 各VMの設定変更

両方のVMで:

1. VM選択 → **設定** → **ネットワーク** → **アダプタ1**
2. 割り当てを **Host-Only Adapter** に変更
3. 名前 `vboxnet0` を選択
4. OK

## ステップ3: 攻撃用VMを準備

Kali / Parrot を VirtualBox にインポートして、ネットワークを **同じ Host-Only Adapter** に設定。

## ステップ4: 起動 → ターゲットIP発見

1. ターゲットVM起動 (yamamoto-web01)
2. 攻撃用VMを起動
3. 攻撃用VMのターミナルで:

```bash
# 同一ネットワーク上のホストを発見
sudo nmap -sn 192.168.56.0/24
# または
arp -a | grep 192.168.56
```

`192.168.56.X` のような IP が見えたら、それがターゲット。

## ステップ5: 攻撃開始

```bash
# 接続確認
ping <target-ip>

# Webサイトを開いてみる
firefox http://<target-ip>/

# CTFスタート!
```

[`PRIMER.md`](PRIMER.md) → [`WALKTHROUGH-BEGINNER.md`](WALKTHROUGH-BEGINNER.md) の順で読み進めてください。

## トラブルシュート

### ターゲットVMがネットワーク上に見えない
- 両VMとも Host-Only Adapter で同じネットワーク (`vboxnet0`) になっているか
- ターゲットVM側で IP が割り当てられているか(コンソール画面で `ip a` で確認)
- VirtualBox のホストオンリーネットワークマネージャーで DHCP が有効か

### "Connection refused" / Webサイトが開けない
- ターゲットVMが起動完了しているか(数十秒待つ)
- 攻撃用VMからターゲットVMにpingが通るか

### Firefox が動かない / スピード遅い
- 攻撃用VMに割り当てるRAMを2GB以上に
- `curl` だけでも基本攻略可能

## 倫理ルール

- **このVMは合法的な学習目的でのみ攻撃すること**
- **ホストネットワークや本番システムへ攻撃を波及させないこと**(Host-Only にしているのはこのため)
- 取得したフラグは**外に公開しない**(他のチームメイトの楽しみを奪うため)

幸運を!
