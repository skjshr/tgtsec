# Target preparation

## 1. 書き込み前gate

次が一つでも満たせなければpartition操作を止めます。

- 対象ノートの型番、UEFI/GPT、内蔵diskのby-id・serial・WWN・sizeを記録した。
- Windowsの回復手段とbare-metal backupを別mediaで実際に読めた。
- Windows system volumeはBitLocker/device encryptionを「一時停止」ではなく完全復号し、
  `manage-bde -status C:`で`Fully Decrypted`かつ`0.0%`を確認した。
- WindowsのhibernationとFast Startupを両方無効化し、再起動後も無効である証跡を取った。
- Windows側のdisk管理でDebian用80GB以上を「未割り当て」にした。
- Windowsはofflineかつsacrificialで、実data、browser login、保存credentialを持たない。
- 使用USBのhealth/full-capacity testが合格した。warning/error mediaは使わない。
- Debian installerとbackupのSHA-256を別経路の記録と照合した。

自動partition scriptは提供しません。Debian 13 installerのmanual partitioningで、記録済みの
未割り当て領域だけにBtrfs rootを作ります。ESPは既存partitionをformatせず`/boot/efi`へ使い、
Windows partitionを変更対象に選びません。確認画面の変更予定を撮影し、別の運営者がdisk sizeと
partitionを照合してから進めます。

installerと手順の正本は[Debian 13 amd64 installation guide](https://www.debian.org/releases/trixie/amd64/)
です。第三者の再配布imageや自動partition recipeへ置き換えません。

### Windowsをgoldenにする前の確認

Windowsはこの演習だけに使うsacrificial installにします。設定の「デバイスの暗号化」または
「BitLockerの管理」でsystem volumeの暗号化をオフにし、復号が完了するまで待ちます。
保護の一時停止や`Protection Off`だけでは合格にしません。管理者Terminalで次を実行します。

```text
manage-bde.exe -status C:
powercfg.exe /hibernate off
reg.exe add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f
powercfg.exe /availableSleepStates
reg.exe query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power" /v HiberbootEnabled
```

`manage-bde`は`Conversion Status: Fully Decrypted`、`Percentage Encrypted: 0.0%`でなければ中止します。
`powercfg`ではhibernationが利用不能、registryは`HiberbootEnabled REG_DWORD 0x0`であることを確認します。
既存の回復keyは復号とbare-metal backupの検証が終わるまで別mediaで保管し、証跡へkey本文を残しません。
いったん再起動して同じ確認を繰り返し、最後は`shutdown.exe /s /t 0`で完全shutdownします。

## 2. Debian golden state

- Debian 13 amd64 minimalをUEFI modeで導入する。
- Btrfsのroot subvolume名を`@`にする。
- hostname、user、fixture dataは架空名だけにする。
- EthernetとWi-Fiを物理的に外したまま、platform manifestのpackageを導入する。
- package導入中にdaemonを外部へ公開しない。初期構築だけはservice autostartを抑止し、完了後に
  platform overlayを適用してboot quarantineと明示的なdisable状態を確認する。
- worldとtelemetryのunit名がplatform manifestのprovider表と一致することを確認する。
- `/etc/default/grub.d/90-open-world-root.cfg`を適用して`update-grub`を実行する。生成された
  `/boot/grub/grub.cfg`のroot指定はDebian `PARTUUID`または`LABEL=open-world-lab`で、
  `root=UUID=`ではないことを確認する。
- golden snapshotと`EFI/debian` archiveを作る直前にDebian Btrfsの完全なfilesystem UUIDを
  `findmnt -no UUID /`と`blkid`で照合し、
  `recovery.goldenBtrfsStream.filesystemUuid`へ記録する。以後snapshot/EFI archiveと別々に
  更新しない。

### 対象Debianのlive identity gate

`install`、`install-target`、mode切替、ready preflightを行う対象OSは、必ず**対象ノート上で起動した
Debian 13 amd64**です。次を読み取り、4値が完全一致しなければ、planでも適用でも中止します。

```text
. /etc/os-release
printf 'ID=%s VERSION_ID=%s\n' "$ID" "$VERSION_ID"
dpkg --print-architecture
uname -m
```

期待値は順に`ID=debian VERSION_ID=13`、`amd64`、`x86_64`です。似たDebian系OS、別release、arm64、
container/chrootの表示を推測で通しません。inventoryにもこの読み取り値を残し、運営者二人でprofileの
disk/PARTUUID照合と合わせて確認します。

package取得のsupported pathは[PACKAGE-BOOTSTRAP.md](PACKAGE-BOOTSTRAP.md)の署名済みoffline
apt mediaだけです。overlay前の一時tetheringやLAN接続は行いません。

## 3. 実機profile

`platform/profile.example.json`をコピーし、read-only commandの出力から埋めます。

```text
lsblk --json --bytes --output PATH,TYPE,SERIAL,WWN,SIZE,PARTUUID,MOUNTPOINTS
ls -l /dev/disk/by-id/
ip -json link show
```

`/dev/sda`や画面上のdisk番号はprofileへ使いません。wired interfaceはMAC addressと組で記録します。
profileにsecretやWi-Fi passwordは保存しません。

## 4. Wi-Fi maintenance gate

保守接続のownerはNetworkManager＋wpa_supplicantです。次を実機で確認するまで
`connectivity-on`を合格にしません。

- 対象Wi-Fi chipsetと必要firmwareがDebian 13で認識される。
- personal tetheringだけへ接続でき、会社LANや保存済みSSIDへ自動接続しない。
- credentialはNetworkManagerのroot-only接続として置き、recovery imageへ平文転記しない。
- `connectivity-off`後にWi-Fiがrfkillされ、default routeと外部DNSが消える。
- Wi-Fi有効中も全lab serviceがinactiveのままである。
- `connectivity-on`前に直結Ethernet cableを物理的に抜き、profile wired NICがdown、
  carrierなし、addressなしである。NetworkManagerでは同NICを明示的にunmanagedにする。
- 直結Ethernetのownerはmode controllerの直接`ip`操作だけにする。未使用の
  `systemd-networkd` `.network`設定は残さず、`systemd-networkd.service`はmasked/inactiveである。
- `connectivity-on`は未消費fresh markerがあり、session.env、session-id、telemetry stateがない
  clean golden stateだけで使う。exerciseへ一度でも入った後はtrusted recoveryまで使わない。

firmware不足、rfkill不能、勝手なauto-connectがあれば、有線offline maintenanceだけに戻します。

## 5. Platform overlay install

platform directoryで`validate`と`render`を行い、tree hashを別記録へ写します。最初の`install`は
必ずdry-runにし、表示対象が記録済みdiskと3 PARTUUIDだけであることを二人で確認します。
初回のclean Debianはmaintenance target未導入なので、`installed-debian`かつ厳密なoffline
bootstrap inventoryを例外的に受け付けます。package全件installed、全service inactive、全radio
blocked、全非loopback NIC down、route/外部DNS/非loopback listenerなしが一つでも崩れれば拒否します。
`--apply`後は次を確認します。

- `open-world-boot-quarantine.service`がactive/enabled。
- `open-world-maintenance.target`がactive/enabled。
- vulnerable、DHCP、telemetry、NetworkManager、wpa_supplicantがinactive。
- `open-world-telemetry.socket`もinactive/disabled。
- `nmbd.service`はinactive/maskedで、SambaはTCP/445だけに固定されている。
- `systemd-networkd.service`はmasked/inactiveで、直結Ethernetに`.network`設定が残っていない。
- `/run/open-world-dnsmasq`は`dnsmasq:root 0750`、lease fileは`dnsmasq:root 0640`。
- 固定`ExecStart`の`--user=dnsmasq`により、daemonの実効userとlease所有者が一致する。
- dnsmasqはDebian package helperをoverrideしてlab configだけを読み、`port=0`でDNS listenerを
  無効化する。DHCPはaddressだけを配り、routerとDNS resolverを広告しない。
- `/run/open-world-lab/exercise-ready`が存在しない。

## 6. Target bundle build/install

world fixtureとtelemetry runtimeを一つの検証可能bundleへまとめます。このbuildは
運営用workstationで行い、出力先は存在しないか空のremovable operator media上directoryだけです。
guide buildは入力にせず、平文Windows flagを含むrepositoryやbundleを対象Debianの内蔵filesystemへ
置きません。

```text
cd labs/open-world-target/operator
python build_target_bundle.py build \
  --output ACTUAL_EMPTY_BUNDLE_DIRECTORY

python build_target_bundle.py verify \
  --bundle ACTUAL_EMPTY_BUNDLE_DIRECTORY
```

bundleはDebian用13 flags/runtime、Windows用1 flag、installer-private synthetic credentialを
別roleで保持します。Windows artifactとcredentialはDebian rootへcopyされず、Debian runtimeには
平文answerではなく一方向hash verifierだけが入ります。event HMAC keyはbundleに含めず、guarded
install適用時だけ32 random bytes相当のASCIIとして生成します。

対象Debianのmaintenance quarantineで、まず`install-target`を`--apply`なしで実行します。
`ACTUAL_BUNDLE_SHA256`はbuild/verifyが返した`bundleManifestSha256`の完全値です。

```text
sudo open-world-platform install-target \
  --profile /etc/open-world-lab/profile.json \
  --bundle ACTUAL_BUNDLE_DIRECTORY \
  --bundle-manifest-sha256 ACTUAL_BUNDLE_SHA256 \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --windows-partuuid ACTUAL_WINDOWS_PARTUUID \
  --confirm "INSTALL TARGET BUNDLE /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_INSTALL_INVENTORY.json
```

planのdisk/3 PARTUUID/hashを二人で照合してから同じ引数へ`--apply`を加えます。適用後に確認します。

- telemetry service/socketを含むlab unitはdisabled/inactiveのまま。
- `open-world-file-watch.service`は配置済みかつdisabled/inactiveで、exercise targetから必須起動される。
  root所有のwatcherはbundleに固定したallowlist pathだけをinotifyで監視し、raw syscall record、
  command、任意path、file contentを保存・配信しない。
- `rpcbind.service`/`.socket`と不要な`rpc-statd.service`/`rpc-statd-notify.service`はmasked。
  NFSはv4-onlyの2049/TCP、固定mountd 20048/TCPで、20048は直結側nftablesから明示dropされる。
- `nmbd.service`はinactive/maskedで、`smbd`はTCP/445だけを使う。139/TCPと137-138/UDPは待受しない。
- dnsmasq leaseの親directory/fileはそれぞれ`dnsmasq:root 0750`/`0640`。router optionと
  DNS server optionは空で、search domainも配らない。
- dnsmasqは`port=0`でTCP/UDP 53をlistenせず、package helper、暗黙の`/etc/dnsmasq.d`走査、
  resolvconf、上流serverを使わない。
- Apacheは`10.13.37.10:80`だけをlistenし、`000-default`はdisabled。
- telemetryは`10.13.37.10:8787`で、Bridge bearer認証後のsanitized APIだけを提供する。
- `/usr/local/bin/kazekiri-report`は`root:root 4755`、
  `/usr/local/sbin/open-world-telemetry-status`は`root:root 0750`。
- event-key directoryは`root:root 0711`、low/root keyはそれぞれ
  `root:lab-events 0440`と`root:lab-telemetry 0440`。鍵本文は証跡へ出さない。
- `/var/lib/examserver-open-world/fresh-state.json`は`root`所有`0400`で、session/state fileは
  まだ存在しない。このmarkerは全config/unit検査後の最終commitとして配置される。
- target install直後は`/etc/examserver-open-world/session.env`がまだ存在しない。exercise開始時に
  `root:lab-telemetry 0640`でsession IDとfreshな`TELEMETRY_BRIDGE_TOKEN`をatomic生成する。
  token本文はbundle、plan、log、証跡へ出さず、運営者管理の安全な経路でKaliの
  `BRIDGE_TARGET_TOKEN`へ同じ値を渡す。

鍵本文を読まず、実accountでread可否だけを確認します。期待値は`www-data`/`nobody`がlowのみ、
`lab-telemetry`がlow/root、一般の`daemon` userがどちらも不可です。

```text
sudo -u www-data test -r /etc/examserver-open-world/event-keys/low.key
sudo -u www-data test ! -r /etc/examserver-open-world/event-keys/root.key
sudo -u nobody test -r /etc/examserver-open-world/event-keys/low.key
sudo -u nobody test ! -r /etc/examserver-open-world/event-keys/root.key
sudo -u lab-telemetry test -r /etc/examserver-open-world/event-keys/low.key
sudo -u lab-telemetry test -r /etc/examserver-open-world/event-keys/root.key
sudo -u daemon test ! -r /etc/examserver-open-world/event-keys/low.key
sudo -u daemon test ! -r /etc/examserver-open-world/event-keys/root.key
```

NFSのsystemd構成はDebianの
[nfs.systemd(7)](https://manpages.debian.org/trixie/nfs-common/nfs.systemd.7.en.html)
に従い、rpcbindのservice/socketとv4-onlyでは不要なstatd unitをmaskします。標準
`nfs-server.service`を起動しても111やrandom NSM listenerが現れず、Kaliから見えるNFS portが
2049だけであることを実機gateにします。

Windowsの1 flagはWindowsをoffline maintenanceで起動した時だけ、bundleの
`windows-offline/windows-fixture/Users/Public/Documents/KazekiriArchive/WINDOWS.flag`を
`C:\Users\Public\Documents\KazekiriArchive\WINDOWS.flag`へ手動配置します。演習中のDebianへ
Windows partitionをmountして配置しません。配置後にも完全復号、hibernation/Fast Startup無効を
再確認して完全shutdownします。target install後はbundle mediaをunmountして標的から外し、
内蔵Debianにbundle/repository/private answerのcopyがないことを確認してからgoldenを作ります。

Windows bonusを演習中に読めるよう、platformは`mnt-windows.mount`を用意します。これはprofileの
`windowsPartuuid`を`/dev/disk/by-partuuid/`で指定し、exercise targetからだけ
`/mnt/windows`へ`ntfs3`の`ro,nosuid,nodev,noexec`でmountします。boot enableはしません。
golden前にDebian maintenanceで一度だけ、次を上から順に実行します。

```text
PROFILE=/etc/open-world-lab/profile.json
WINDOWS_PARTUUID="$(jq -er '.target.windowsPartuuid' "$PROFILE")"
WINDOWS_DEVICE="$(readlink -f "/dev/disk/by-partuuid/$WINDOWS_PARTUUID")"
TARGET_DISK="$(readlink -f "$(jq -er '.target.diskById' "$PROFILE")")"
WINDOWS_PARENT="/dev/$(lsblk -nro PKNAME "$WINDOWS_DEVICE")"
test "$WINDOWS_PARENT" = "$TARGET_DISK"
sudo systemctl start mnt-windows.mount
findmnt --mountpoint /mnt/windows --output SOURCE,TARGET,FSTYPE,OPTIONS
sudo test -r /mnt/windows/Users/Public/Documents/KazekiriArchive/WINDOWS.flag
sudo systemctl stop mnt-windows.mount
```

表示されたsourceが`WINDOWS_DEVICE`、filesystemが`ntfs3`、optionsに
`ro,nosuid,nodev,noexec`があり`rw`がないことを二人で確認します。mountがhibernation、暗号化、
dirty filesystemなどで失敗したら`ntfsfix`、`remove_hiberfile`、`-o rw`で回避せず、Windowsへ
offline bootして原因を直します。flag本文は画面や証跡へ出しません。

## 7. Recovery kit

target install、event key生成、Windows fixture配置、fresh-state marker確認、`update-grub`まで
終え、まだ一度もexerciseへ入っていない状態をgoldenとします。ノートを停止して信頼済みLinux
recovery mediaからbootします。内蔵Debianを通常bootした状態でgolden assetを作りません。

Recovery media上で次を用意します。

- read-only snapshotから送った`assets/debian-root.btrfs`。受信時のsubvolume名は`@`。
- `EFI/debian`だけを含み、link/device/path traversalを含まない`assets/debian-efi.tar`。
- offline Windows、ESP、Debian、partition tableを含む`assets/full-disk.img`。
- `assets/full-disk.img`のlogical byte sizeが対象diskの記録済み`diskSizeBytes`と完全一致すること。
- `EFI/Microsoft` tree hash。
- 3 assetそれぞれのSHA-256。

profileへasset hash、recovery media UUID、golden Debian Btrfs UUIDを確定後、block deviceではなく
空directoryへkitを生成します。

```text
python build_recovery_kit.py build \
  --profile ACTUAL_PROFILE.json \
  --asset-root ACTUAL_ASSET_ROOT \
  --output EMPTY_KIT_DIRECTORY

python build_recovery_kit.py verify \
  --root EMPTY_KIT_DIRECTORY
```

このscriptはUSBをformatせず、boot loaderも書きません。完成directoryは既に検査済み・boot可能な
recovery mediaへ通常fileとしてcopyし、copy後に同じ`verify`を通します。mediaのkernel command
lineには`examserver-open-world-recovery=1`を固定し、boot中のroot block topologyが内蔵対象diskを
含まないことを確認します。USBは演習中に抜いて保管します。
