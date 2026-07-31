# Recovery

exercise後のDebianはroot compromise済みです。installed OS内でfileを消して再利用せず、
信頼済みUSBから復旧します。

## 1. Recovery boot gate

supported recovery mediaは必要toolを備えた信頼済みの互換Linuxを
USBへblock-backed full installしたものです。overlay rootのlive ISO、内蔵disk boot、
asset USBだけの後付けmountは拒否します。

対象diskとrecovery USBを接続し、USBからbootします。inventoryは次をすべて検証します。

- kernel command lineに`examserver-open-world-recovery=1`。
- `bootEnvironment=trusted-recovery-media`。
- kit ID、media UUID、marker、asset hashがprofileと一致する。
- disk by-id、serial、WWN、byte sizeが一致する。
- normal operationではDebian/ESP PARTUUIDも一致し、両partitionがunmountedである。
- full operationではpartition tableが失われていてもよい。存在するtarget partitionはmountしない。
- recovery rootとasset mountが同じ物理USBで、`rootSharesRecoveryMedia=true`。
- root/assetsのbacking deviceにtarget diskを含まない。

```text
sudo open-world-platform inventory \
  --profile ACTUAL_PROFILE.json \
  --boot-environment trusted-recovery-media \
  --recovery-mount ACTUAL_RECOVERY_MOUNT \
  --output ACTUAL_RECOVERY_INVENTORY.json
```

不明なdevice、mount済みtarget、hash差分を推測で通しません。

## 2. Normal recovery

partition tableとESPを保ったまま、Debian Btrfs partitionと`EFI/debian`をgoldenへ戻す標準経路です。
最初は必ずplanだけを表示します。

```text
sudo open-world-platform recover \
  --profile ACTUAL_PROFILE.json \
  --operation normal \
  --recovery-mount ACTUAL_RECOVERY_MOUNT \
  --marker ACTUAL_RECOVERY_MOUNT/RECOVERY-MEDIA.json \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --image-sha256 ACTUAL_BTRFS_STREAM_SHA256 \
  --efi-sha256 ACTUAL_DEBIAN_EFI_SHA256 \
  --confirm "RESTORE DEBIAN /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_RECOVERY_INVENTORY.json
```

planが次の順序だけを含むことを二人で確認した後、同じcommandへ`--apply`を加えます。

1. golden filesystem UUIDでDebian partitionをBtrfs formatし、`blkid`で読み戻す。
2. streamからtop-level `@`を一つだけ受信してwritableにする。
3. `fstab`/GRUBがstable PARTUUIDまたはlabelを使うことを検証する。
4. archiveの`EFI/debian`だけをESPへ戻す。

## 3. Full-disk recovery

partition tableまたはESPを含む専用disk全体をgoldenへ戻す場合だけ使います。これは対象diskの
全byteを上書きします。image hashだけでなくlogical byte sizeもprofileのdisk sizeと完全一致しなければ
拒否されます。既存partition table/PARTUUIDが壊れていても、stable physical disk identityの完全一致は
省略しません。

```text
sudo open-world-platform recover \
  --profile ACTUAL_PROFILE.json \
  --operation full \
  --recovery-mount ACTUAL_RECOVERY_MOUNT \
  --marker ACTUAL_RECOVERY_MOUNT/RECOVERY-MEDIA.json \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --image-sha256 ACTUAL_FULL_DISK_SHA256 \
  --confirm "RESTORE FULL DISK /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_RECOVERY_INVENTORY.json
```

確認文、target device、expected byte count、overwritesが一致した後だけ`--apply`を加えます。

## 4. 復旧後の物理gate

USBを外してDebianをbootし、次を新しい証跡として確認します。

- maintenance quarantineから開始し、外部routeとlab listenerがない。
- fresh-state markerが正しく、session/state/build checkout/credentialがない。
- exercise preflightがdirect cableだけで通る。
- 13 optional flagsの初期runtime状態が戻っている。
- Kali Firefoxのpairing、現在地、次の選択肢、説明、root完了がfresh revisionから再現する。

一つでも失敗したら次の参加者へ渡しません。software test合格を実restore成功の代用にしません。
