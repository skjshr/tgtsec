# Clean-install package bootstrap

これは専用diskへ公式Debian 13 amd64を新規installした直後だけに使う経路です。既存targetの更新は
[CODEX-BOOTSTRAP.md](CODEX-BOOTSTRAP.md)の「maintenance update」を使います。exerciseを一度でも
開始したOSをそのままupdateしてはいけません。先に信頼済みUSBで復旧します。

## 1. Debianを専用diskへ入れる

公式Debian 13 amd64 installerで対象disk全体を使います。profile対象以外のdiskは取り外し、
installerの変更予定に対象by-id/serial/sizeだけが含まれることを二者で確認します。
最小構成でinstallし、root filesystemはBtrfs、UEFI用ESPを作ります。この段階ではworld fixture、
認証情報、実dataを入れません。

## 2. Package install中のdaemon起動を止める

`/usr/sbin/policy-rc.d`が既に存在する場合は上書きせず中止します。存在しない場合だけ、review済み
releaseと同じread-only operator mediaからこのdirectoryの配布版を目視して導入します。

```text
sudo install -o root -g root -m 0755 policy-rc.d /usr/sbin/policy-rc.d
```

clean installにはまだvulnerable serviceもplatform quarantineもありません。この一回だけ、
公式Debian repositoryへのmaintenance networkを使えます。対象へ保存credentialを作らず、
必要packageを導入したら直ちに切断します。offlineの署名済みDebian mediaを使っても構いません。

```text
sudo apt-get update
sudo apt-get install --no-install-recommends \
  ca-certificates git nodejs npm python3 jq
```

repositoryをanonymous cloneした後、`manifest.json`のpackage一覧も同じ`policy-rc.d`下で導入します。
aptが非公式sourceや認証を要求したら中止します。

導入中はApache、SSH、Samba、NFS、dnsmasq、rpcbind/statdを含むlab service/socketが一つもactiveに
なっていないことを別consoleから確認します。起動した場合はnetwork cableを抜き、そのbuildを
golden候補にしません。

## 3. Clean-install reconstructionへ引き渡す

[CODEX-BOOTSTRAP.md](CODEX-BOOTSTRAP.md)の「共通のpinned anonymous clone」へ進み、
workflowを`clean-install`として記録します。Codexが作るのは検証結果とdry-run planまでです。
disk変更は[PREPARE-TARGET.md](PREPARE-TARGET.md)の二者確認後にoperatorが行います。

platform overlay適用後、boot quarantineとmaintenance targetがactive、全lab/connectivity serviceが
inactiveであることをlive inventoryで確認します。その後だけ、配布した`policy-rc.d`と元fileの
hashを照合して削除します。失敗時はnetworkを再接続せず、fileと証跡を保全します。

platform install直前にはmaintenance networkを物理的に外し、全非loopback NICをdown、radioをblock、
default route/外部DNS/非loopback listenerをゼロにします。

初回inventoryは次の契約です。

```text
sudo python -m open_world_platform.cli inventory \
  --profile ACTUAL_PROFILE.json \
  --boot-environment installed-debian \
  --output ACTUAL_BOOTSTRAP_INVENTORY.json
```

exact disk/root/PARTUUID、Debian 13 amd64/x86_64、manifest package全件、default routeなし、
外部DNSなし、非loopback listenerなし、radio blocked、service inactiveが揃わなければ
platform installは拒否されます。
