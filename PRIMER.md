# PRIMER — CTF初参加者へ

> 「CTF って何?どこから手を付ければ?」という人向け。

## CTF とは

**Capture The Flag** の略。脆弱なシステムを合法的に攻撃して、隠された「フラグ」を見つけるゲーム。

このCTFは **Boot2Root** 形式 — VM 1台のあらゆる隙を見つけて、最終的に **root 権限** を取るのが目標。途中で3つのフラグ(`TSHL{...}`)を回収します。

## 心構え

1. **手を動かす** — ググるよりまず叩く
2. **記録する** — 試したコマンドと結果をメモ。後で必ず役立つ
3. **詰まったら寝る** — 本当に。意外と次の日に解ける
4. **「これ怪しい」を信じる** — なんか変なURLパラメータ、なんか古いバージョン番号、なんか空のディレクトリ — 全部攻撃対象

## やること(ざっくり)

```
[偵察] → [脆弱性発見] → [侵入] → [情報収集] → [権限昇格]
```

中級初心者向け CTF はだいたいこの流れ。各段階を一つずつ進めましょう。

## 必要なツール

攻撃用VMに **Kali Linux** か **Parrot OS** を使うのが楽(ツールが最初から入っている)。普通のLinux/Macでも全部入れられます。

### 最低限これだけは入れる

| ツール | 用途 | インストール |
|--------|------|------------|
| `nmap` | ポートスキャン・サービス特定 | `apt install nmap` |
| `curl` / `wget` | HTTPリクエスト送信 | 多分すでに入ってる |
| `ssh` | SSHログイン | 多分すでに入ってる |
| `python3` | スクリプト実行・PoC実行 | 多分すでに入ってる |
| `gobuster` or `dirb` | URLディレクトリ列挙 | `apt install gobuster` |

### あると便利

- `Burp Suite Community` — HTTP通信を覗き見・改ざんできる(GUI)
- `searchsploit` — Exploit-DB検索 (`apt install exploitdb`)
- `john` / `hashcat` — パスワードハッシュ解析
- `git` — Pythonの公開エクスプロイトを clone するため

## 用語ミニ辞書

- **RCE** (Remote Code Execution) — 遠隔から任意のコマンド実行できる脆弱性。最強
- **LFI** (Local File Inclusion) — Webアプリが任意のローカルファイルを include してしまう
- **CVE** — 脆弱性の通し番号 (`CVE-YYYY-NNNN`)。これで検索すると公開情報がわんさか出る
- **PoC** (Proof of Concept) — 「動く脆弱性デモコード」。GitHub や Exploit-DB に転がってる
- **Privesc** (Privilege Escalation) — 権限昇格。一般ユーザー → root とか
- **GTFOBins** — Linux 標準コマンドを使った権限昇格トリック集 (https://gtfobins.github.io/)
- **www-data** — Linux の Web サーバー実行ユーザー(典型的にRCEで最初に取る権限)

## 最初の30分(おすすめ流れ)

```bash
# 1. ターゲットの IP を確認(ホスト側 arp -a, または VMコンソール画面)
TARGET=192.168.X.X

# 2. ポートスキャン (詳細版)
nmap -p- -sV -sC $TARGET

# 3. Web サイトを開いて全ページ巡回
firefox http://$TARGET/

# 4. URLパラメータや「変な動き」をメモ

# 5. ディレクトリ列挙
gobuster dir -u http://$TARGET/ -w /usr/share/wordlists/dirb/common.txt
```

このあたりで**何かが見えるはず**。見えたら次の `WALKTHROUGH-BEGINNER.md` のヒントを段階的に開いてください。
