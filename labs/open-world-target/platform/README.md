# Debian platform

このディレクトリは、Debian 13実機を安全側から演習modeへ切り替えるための正本です。
初期値は常にdry-runで、実機へ書く操作は一致検査と明示的な`--apply`がない限り実行しません。

## 所有するもの

- `manifest.json`: Debian release、package、service、port、install fileの固定一覧
- `profile.example.json`: 実機固有のdisk、PARTUUID、NIC、復旧asset情報の型
- `templates/`: wired-only network、DHCP-only dnsmasq、nftables、systemd mode
- `open_world_platform/`: overlay生成、inventory、preflight、mode、install、recovery CLI
- `tests/`: hostのdisk/networkへ触れないcontract test

攻撃world、flag、telemetryの内容はここへ置きません。service名だけを
`manifest.json`の`serviceProviders`で相互契約にしています。

## Fail-closedの順序

Exerciseへの遷移は次の順序を変えません。

1. live `/`、disk identity、3 PARTUUIDが対象Debianと一致することを確認する。
2. 対象OSのlive identityが`ID=debian`、`VERSION_ID=13`、`dpkg --print-architecture=amd64`、
   `uname -m=x86_64`であることを確認する。install、target install、mode、preflightは一つでも
   異なれば拒否する。これは対象Debianのgateであり、信頼済みrecovery USBは必要toolを備えた
   別の互換Linuxでよい。
3. 全lab serviceを停止する。
4. NetworkManager、wpa_supplicant、systemd-resolvedを停止する。
5. Wi-Fi、WWAN、Bluetoothをrfkillし、wired以外のNICをdownにする。
6. wiredを`10.13.37.10/24`だけにし、default routeを消す。
7. IPv4 forwardingとIPv6を止め、output dropのnftablesを入れる。
8. 読み取り専用inventoryでisolation preflightを通す。
9. `/run/open-world-lab/exercise-ready`を作り、初めてlab serviceを起動する。
10. service込みのready preflightを通す。失敗時はmarkerを消してmaintenanceへ戻す。

Maintenanceは最初に全lab serviceを止め、quarantine firewallを入れます。Wi-Fiを使う操作は
`connectivity-on`へ分離され、対象Debianの一致、全service停止、未消費fresh marker、
session/state不在をlive inventoryで確認できなければ実行できません。一度でもexerciseへ入ったOSは
root compromise済みとして扱い、信頼済みrecovery完了までconnectivityを再開しません。

## Profile

`profile.example.json`をコピーし、対象実機と信頼済み復旧mediaで読んだ値だけを記入します。
次の値に推測、短縮名、`/dev/sda`のような不安定名を使いません。

- `/dev/disk/by-id/...`、serial、WWN、byte単位のdisk size
- Debian、ESP、WindowsのPARTUUID
- wired interface名とMAC address
- NetworkManagerを使うmaintenance connectivity
- 復旧USBのfilesystem UUID、golden Debian Btrfs UUID、kit ID、3 assetのSHA-256
- `EFI/Microsoft` treeのSHA-256

placeholder、0 byte disk、相対disk path、不正なhashが一つでもあれば`validate`は失敗します。

```text
python -m open_world_platform.cli validate --profile profile.json
```

## Deterministic overlay

空のstaging directoryだけを出力先にします。同じmanifest/profile/sourceからは同じtree hashが
生成されます。既存fileがあるdirectoryを自動cleanしません。

```text
python -m open_world_platform.cli render \
  --profile profile.json \
  --output build/platform-overlay
```

生成物にはinstall fileごとのmode/hash、package一覧、platform manifest、実機profileが入ります。
`install`も既定はplan出力だけです。適用には、live inventoryと一致するdisk identity、
3 PARTUUID、overlay tree hash、完全な確認文、root、`--apply`がすべて必要です。

```text
python -m open_world_platform.cli install \
  --profile profile.json \
  --overlay build/platform-overlay \
  --overlay-sha256 ACTUAL_64_HEX \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --windows-partuuid ACTUAL_WINDOWS_PARTUUID \
  --confirm "INSTALL PLATFORM /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory evidence/install-inventory.json
```

`--apply`を加える判断条件は[PREPARE-TARGET.md](../operator/PREPARE-TARGET.md)に固定しています。
packageは[offline bootstrap手順](../operator/PACKAGE-BOOTSTRAP.md)でworld fixtureより先に導入し、
NICを物理的に外した状態でoverlayを適用します。inventoryでmanifest package全件がinstalledと
確認できなければplatform/target installは拒否します。初回だけはmaintenance unit未導入の
`installed-debian`を、route/外部DNS/非loopback listenerなし・radio blocked・全service inactiveの
strict offline状態で受け付けます。
overlay適用後はboot quarantineを先に起動し、lab/connectivity serviceをdisabledにします。

## Deterministic target bundle

`build-target-bundle`はworld fixtureとtelemetry runtimeを一時directoryで結合し、全fileの
SHA-256・owner・group・modeを`TARGET-BUNDLE.json`へ固定します。guide build、server、serviceは
入力にもDebian出力にも含めません。13個のDebian flagと
1個のWindows offline flagを別roleにし、Windows/installer-private fileをDebianへ導入しません。
Debian runtimeへ入るのは一方向hashの`flag-verifiers.mjs`だけで、平文answer moduleはbuild専用です。
event HMAC keyはbundleへ保存せず、guarded `install-target --apply`時に32 random bytes相当を
生成します。telemetry Bridge bearer tokenもbundleへ保存せず、fresh exercise開始ごとに
32 random bytesから生成し、`/etc/examserver-open-world/session.env`へ
`root:lab-telemetry 0640`でsession IDと一緒にatomic書き込みします。

```text
python -m open_world_platform.cli build-target-bundle \
  --repo-root ../../.. \
  --output build/target-bundle

python -m open_world_platform.cli verify-target-bundle \
  --bundle build/target-bundle
```

`install-target`も既定はdry-runです。live `/`がprofileのDebian PARTUUID、maintenance quarantine、
disk identity、3 PARTUUID、bundle manifest hash、完全な確認文のすべてに一致して初めて適用できます。
適用はApache/PHP、SSH、Samba、NFS/file watcher、SUID helper、telemetryを検証しますが、lab serviceと
telemetry socketはdisabledのまま残し、fresh-state markerをgolden snapshot前に用意します。
markerは全config検査、unit停止、maintenance起動、masked状態の再確認が終わった最後にだけ配置します。

NFSはv4-onlyの2049/TCPを公開し、標準unitが必要とするmountdは固定20048/TCPにします。
`rpcbind.service`/`.socket`と不要なstatd unitをmaskし、20048はexercise nftablesで直結側から
明示dropします。root所有の`open-world-file-watch.service`もexercise中の必須serviceです。これは
bundleに固定したallowlist pathだけをinotifyで監視し、raw syscall record、command、任意path、
file contentを保存・送信しません。
preflightはこの境界が揃う場合にだけ内部mountd listenerを許容します。

保守接続ではprofileの直結EthernetをNetworkManagerの`unmanaged-devices`へ固定します。
`connectivity-on`は同NICがdown、carrierなし、addressなしであり、専用cableが物理的に外れた状態を
要求します。planもwired down/address flushをhost firewallとNetworkManager起動より先に実行します。
直結Ethernetの設定ownerはmode controllerの直接`ip`操作だけです。未使用の
`systemd-networkd` `.network`設定は置かず、`systemd-networkd.service`はmasked/inactiveのままにして
NetworkManagerやmode controllerと競合させません。

Sambaは`smbd`のTCP/445だけを使い、`nmbd.service`を常時inactive/maskedにして
TCP/139とUDP/137-138を公開しません。dnsmasqのleaseはsession directoryと分離した
`/run/open-world-dnsmasq/dnsmasq.leases`へ置き、tmpfilesで`dnsmasq:root 0640`
（親directoryは`0750`）を毎boot作ります。

dnsmasqは直結EthernetのDHCPだけを所有します。`port=0`でDNS listenerを無効にし、DHCPでは
router、DNS server、search domainを広告しません。Debian packageのhelperをsystemd drop-inで置換し、
専用configだけを明示して暗黙のconf-dir、resolvconf、上流resolverを使いません。
`--user=dnsmasq`でlease所有者と実効userを一致させます。nftablesはTCP/53、UDP/53、TCP/8080を
許可せず、Kali Bridge用のTCP/8787だけを直結interface/subnetへ追加します。公開guideは
`LAB_PUBLIC_ORIGIN`のVercel URLであり、Debianのhost名やportではありません。

Windows bonusはprofileの`windowsPartuuid`から生成した`mnt-windows.mount`がexercise中だけ
`/mnt/windows`へ`ntfs3`の`ro,nosuid,nodev,noexec`でmountします。このunitはboot時disabledで、
`open-world-vulnerable.target`の停止に連動してunmountされます。ready preflightはexact device、
PARTUUID、filesystem、mount options、unit activeを検証します。Windows側はgolden前にsystem volumeを
完全復号し、hibernation/Fast Startupを無効化する実機gateが別途必要です。

## Preflightとmode

fixture fileを使う確認はhost stateを変えません。

```text
python -m open_world_platform.cli preflight \
  --profile profile.json \
  --mode exercise \
  --stage ready \
  --inventory evidence/exercise-inventory.json
```

実機ではまず`--apply`なしのplanを読みます。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to exercise
```

適用例と当日の停止条件は[DAY-OF.md](../operator/DAY-OF.md)にあります。通常bootは
`open-world-boot-quarantine.service`とmaintenance target、演習時だけ
`open-world-exercise.target`を使います。

## Recovery

`recover`はinstalled Debianから実行できません。次が全部一致した信頼済みremovable media上だけで
planまたはrestoreを作ります。

- boot environmentが`trusted-recovery-media`
- recovery media UUID、kit marker、kit ID
- assetがrecovery mount配下の通常fileで、profileと指定値のSHA-256に一致
- disk by-id、serial、WWN、size、3 PARTUUID
- target partitionがunmounted
- recovery mediaのsource deviceがtarget diskではない
- recovery boot rootがremovableで、空でないblock topologyを持ち、target diskを含まない
- recovery boot rootとasset mountが同じ物理USB diskを共有する
- operation固有の完全な確認文

対象Debian用のlive identity gate（Debian 13 amd64/x86_64）はrecovery media自身へは適用しません。
recovery USBは必要toolを備えた別の信頼済み互換Linuxで構いません。
supported構成はその互換LinuxをUSBへblock-backed full installしたものです。`overlay` rootのlive ISO/Live USBや、
内蔵diskからbootしてasset USBだけをmountした構成は拒否します。

Normal recoveryはDebian partitionだけをBtrfs streamから作り直し、`EFI/Microsoft`のtree hashを
golden profileに固定した同じBtrfs UUIDを`mkfs.btrfs --uuid`へ渡して`blkid`で読み戻します。
これにより、復元するDebian EFI/GRUB loaderが保持するfilesystem UUID探索も一致させます。
受信した`@`をwritableに戻し、`fstab`/`grub.cfg`のstable PARTUUID/label契約も検証します。
その後`EFI/Microsoft`を前後比較してから`EFI/debian`だけを戻します。Full recoveryはpartition table、Windows、ESP、
Debianを含むdisk全体を上書きする別operationです。詳しくは[RECOVERY.md](../operator/RECOVERY.md)。
Full recoveryはhashだけでなくraw imageのlogical byte sizeがprofileの対象disk sizeと完全一致しなければ
`dd`へ進みません。

## Automated verification

```text
python -m unittest discover -s tests -v
```

このtestはfixture inventoryと一時directoryだけを使い、`ip`、`nft`、`systemctl`、`mkfs`、
`mount`、`btrfs receive`、`dd`を実行しません。物理的なdual boot、Wi-Fi firmware、実NIC隔離、
Windows boot、実restoreは自動testの合格とは別gateです。
