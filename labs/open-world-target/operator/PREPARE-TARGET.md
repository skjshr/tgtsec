# Dedicated Debian target preparation

## 1. 全disk消去の書き込みgate

対象ノートはDebian専用機です。installerの「disk全体を使用」は内蔵diskのpartition tableと全dataを
消去します。次が一つでも欠ければ開始しません。

- 対象機の型番、UEFI/GPT、disk by-id、serial、WWN、byte sizeを記録した。
- 消去してよい専用機であり、必要dataの復旧確認が別mediaで完了した。
- profile対象以外の内蔵/外付けdiskを取り外した。
- 公式Debian 13 amd64 installerのchecksum/signatureを照合した。
- installer最終画面の対象disk identityと「全disk消去」を二人で読み合わせた。
- recovery USBのhealth/full-capacity testが合格した。

自動partition scriptは提供しません。公式installerでUEFI ESPとBtrfs rootを専用diskに作り、
root subvolumeを`@`にします。変更予定の写真と読み合わせ記録を証跡へ残します。

## 2. Clean installとmaintenance update

新規構築は[PACKAGE-BOOTSTRAP.md](PACKAGE-BOOTSTRAP.md)から始めます。public GitHubのreview済みcommitを
anonymous HTTPS cloneし、Codexだけをdevice authする手順は
[CODEX-BOOTSTRAP.md](CODEX-BOOTSTRAP.md)に固定します。

既存targetの更新は、信頼済み復旧直後のmaintenance stateからだけ行います。exerciseを一度でも
開始したOSをupdate元にせず、先にrecoveryします。clean installとmaintenance updateの証跡を
同じsessionとして混ぜません。

## 3. Profileを実測する

対象Debian上でidentityを読みます。

```text
. /etc/os-release
printf 'ID=%s VERSION_ID=%s\n' "$ID" "$VERSION_ID"
dpkg --print-architecture
uname -m
lsblk --json --bytes --output PATH,TYPE,SERIAL,WWN,SIZE,PARTUUID,MOUNTPOINTS
ls -l /dev/disk/by-id/
ip -json link show
```

期待値は`ID=debian VERSION_ID=13`、`amd64`、`x86_64`です。
`platform/profile.example.json`のschema v2へ、次だけを実測値から入れます。

- stable disk by-id、serial、WWN、byte size
- DebianとESPのPARTUUID
- wired interface名とMAC address
- recovery kit ID、media UUID、golden Btrfs UUID、3 asset hash

`/dev/sda`、推測値、secret、Wi-Fi passwordをprofileへ保存しません。

## 4. Platform overlay

空directoryへrenderし、tree hashとdry-run planを保存します。

```text
python -m open_world_platform.cli validate --profile ACTUAL_PROFILE.json
python -m open_world_platform.cli render \
  --profile ACTUAL_PROFILE.json \
  --output ACTUAL_EMPTY_PLATFORM_OVERLAY

sudo open-world-platform install \
  --profile ACTUAL_PROFILE.json \
  --overlay ACTUAL_PLATFORM_OVERLAY \
  --overlay-sha256 ACTUAL_64_HEX \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --confirm "INSTALL PLATFORM /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_BOOTSTRAP_INVENTORY.json
```

二人でdisk、2 PARTUUID、hash、file一覧を照合した後だけ同じcommandへ`--apply`を加えます。
適用後に次をlive確認します。

- boot quarantineとmaintenance targetがactive/enabled。
- vulnerable、DHCP、telemetry、NetworkManager、wpa_supplicantがinactive。
- `systemd-networkd.service`はmasked/inactive。直結Ethernetのownerはmode controllerの
  直接`ip`操作だけである。
- `nmbd`、rpcbind/statd、raw audit consumerがmasked/inactive。
- exercise-ready markerが存在しない。

## 5. 13-flag target bundle

bundleは空のoperator media上directoryへ作り、検証します。

```text
cd labs/open-world-target/operator
python build_target_bundle.py build \
  --output ACTUAL_EMPTY_BUNDLE_DIRECTORY
python build_target_bundle.py verify \
  --bundle ACTUAL_EMPTY_BUNDLE_DIRECTORY
```

manifestはDebian roleの13 optional flagsだけを持ちます。公開guide、repository、`.git`、
build generator、source credential spec、event key、Bridge tokenはDebianへcopyしません。
生成flagは宣言済み13配置先だけ、生成sales資格情報はSMB引き継ぎ文書だけへ入り、
installer-privateの資格情報はinstall時のstdin利用後にDebianへ残しません。

対象Debianのmaintenance quarantineでdry-runします。

```text
sudo open-world-platform install-target \
  --profile /etc/open-world-lab/profile.json \
  --bundle ACTUAL_BUNDLE_DIRECTORY \
  --bundle-manifest-sha256 ACTUAL_BUNDLE_SHA256 \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --confirm "INSTALL TARGET BUNDLE /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_INSTALL_INVENTORY.json
```

照合後だけ`--apply`を加えます。適用後は次を確認します。

- lab serviceとtelemetry socketはdisabled/inactive。
- `open-world-file-watch.service`は固定allowlist pathだけをinotify監視し、raw syscall record、
  command、任意path、file contentを保存しない。
- NFSはv4-only 2049/TCP、Sambaは445/TCPだけ。dnsmasqはDHCP-onlyでTCP/UDP 53をlistenしない。
- Apacheは`10.13.37.10:80`、telemetryはbearer必須の`10.13.37.10:8787`。
- event keyは対象上で生成され、一般userから読めない。鍵本文は証跡へ出さない。
- fresh-state markerは全config/unit検査後の最後に`root:lab-telemetry 0400`で置かれる。
- session file、checkout、`.git`、build generator、Codex/GitHub credentialが存在しない。

## 6. Golden state

[CODEX-BOOTSTRAP.md](CODEX-BOOTSTRAP.md)のhygiene gateが`passed: true`になり、connectivityを止めた
状態だけをgoldenにします。まだexerciseへ一度も入っていないこと、13 flagsのruntime readability、
Kali Bridgeとのsanitized telemetry、復旧後の再現性は
[PHYSICAL-VERIFICATION.md](PHYSICAL-VERIFICATION.md)へ実測証跡を残します。

## 7. Recovery kit

対象を停止し、信頼済みのblock-backed recovery USBからbootして次を作ります。

- `assets/debian-root.btrfs`: top-level `@`を持つgolden Btrfs stream
- `assets/debian-efi.tar`: `EFI/debian`だけを含むarchive
- `assets/full-disk.img`: 専用disk全体のraw image
- 3 assetのSHA-256と、full image byte sizeのdisk size完全一致

```text
python build_recovery_kit.py build \
  --profile ACTUAL_PROFILE.json \
  --asset-root ACTUAL_ASSET_ROOT \
  --output EMPTY_KIT_DIRECTORY

python build_recovery_kit.py verify \
  --root EMPTY_KIT_DIRECTORY
```

scriptはUSBをformatせずboot loaderも書きません。検査済みbootable USBへ通常fileとしてcopyし、
copy後にも`verify`します。kernel command lineに`examserver-open-world-recovery=1`を固定し、
recovery rootとassetsが同じ物理USB、対象diskとは別であることをlive確認します。
