# Trusted recovery

## 原則

- root取得済みDebianからrestoreしない。
- recovery USBは演習中に外し、書込み可能なまま標的へ接続しない。
- normal recoveryとfull-disk fallbackを同じ確認文で実行しない。
- profile、live inventory、指定値、asset内容の全照合を省略しない。
- Windows/EFIの異常を「Debianだけ直せばよい」と判断しない。

対象Debianの`ID=debian`/`VERSION_ID=13`/`amd64`/`x86_64` gateは、install、target install、mode、
preflightのためのものです。recovery USB自身は同じDebian releaseである必要はなく、toolと必要な
filesystem utilityを備えた信頼済みの互換Linuxで構いません。ただし、recovery marker、USB UUID、
asset hash、target disk identity、boot root topologyの照合は省略できません。
supported recovery mediaは、互換LinuxそのものをUSBへblock-backed full installし、OS rootとkit asset partitionが
同じ物理USBを共有する構成です。`overlay`をrootにするlive ISO/Live USBや、内蔵diskからbootして
kit USBだけをmountする構成はtrusted recoveryとして扱いません。

## Boot後のread-only確認

信頼済みrecovery mediaからbootし、内蔵diskを自動mountしません。boot entryのkernel command
lineに`examserver-open-world-recovery=1`がなければ中止します。kitを検証します。

```text
./tool/open-world-platform hash \
  --kind file \
  --path KIT-MANIFEST.json

python build_recovery_kit.py verify \
  --root ACTUAL_RECOVERY_MOUNT

./tool/open-world-platform inventory \
  --profile ACTUAL_RECOVERY_MOUNT/profile.json \
  --boot-environment trusted-recovery-media \
  --recovery-mount ACTUAL_RECOVERY_MOUNT \
  --output ACTUAL_RECOVERY_INVENTORY.json
```

disk by-id、serial、WWN、size、3 PARTUUIDがprofileと一致し、Debian、ESP、Windowsがunmountedで
あることをinventoryに保存します。recovery mediaがremovableでfilesystem UUIDが一致し、その
backing deviceとboot中のroot filesystem topologyのどちらにも内蔵対象diskが含まれないことを確認します。
さらに`rootSourceRemovable=true`、`rootSourceHasBlockTopology=true`、
`rootSharesRecoveryMedia=true`であり、rootとasset mountの`physicalDisks`が同じUSB diskを
示すことを確認します。1つでも欠ける場合はrestoreへ進みません。

## Normal recovery

Normal recoveryが変更するのはDebian partitionと`EFI/debian`です。partition tableとWindowsを
書き換えません。最初は`--apply`なしでplanだけを出します。次の`ACTUAL_*`はprofileにある完全値へ
置換し、短縮しません。

```text
./tool/open-world-platform recover \
  --profile ACTUAL_RECOVERY_MOUNT/profile.json \
  --operation normal \
  --recovery-mount ACTUAL_RECOVERY_MOUNT \
  --marker ACTUAL_RECOVERY_MOUNT/RECOVERY-MEDIA.json \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --windows-partuuid ACTUAL_WINDOWS_PARTUUID \
  --image-sha256 ACTUAL_GOLDEN_STREAM_SHA256 \
  --efi-sha256 ACTUAL_DEBIAN_EFI_SHA256 \
  --confirm "RESTORE DEBIAN /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory ACTUAL_RECOVERY_INVENTORY.json
```

planは次の7段階でなければ中止します。

1. Debian partitionだけをprofileのgolden Btrfs UUIDで作り直し、`blkid`の読戻しを一致確認する。
2. hash一致済みstreamから`@`を受信する。
3. 受信した`@`を`ro=false`へ変更し、その値を読み戻す。
4. restored `fstab`と`grub.cfg`がDebian PARTUUIDまたは`open-world-lab` labelを使い、
   kernel root指定でfilesystem UUIDへ依存しないことを確認する。EFI/GRUBの埋込み探索用UUIDは
   手順1でgolden値そのものを復元する。
5. `EFI/Microsoft` tree hashを比較する。
6. `EFI/debian`だけを置換する。
7. `EFI/Microsoft` tree hashが不変であることを再比較する。

対象とassetを別の運営者が照合後、同じ引数へ`--apply`を加えます。途中でunmountに失敗した場合、
toolはmountpointを削除せず残します。その状態で再実行せず、mountとlogを保全します。

## Full-disk fallback

次の場合だけfull imageを検討します。

- partition table、Windows、ESPを含めgolden全体へ戻す必要がある。
- normal recoveryを試す前にWindows/EFI異常が確認された。
- bare-metal imageのhashと対象disk identityを二人で再確認した。
- bare-metal imageのlogical byte sizeがprofileの`target.diskSizeBytes`と完全一致する。
- 現在の3 PARTUUIDをまだ正確に観測できる。

full operationはWindowsを含むdisk全体を上書きします。確認文は
`RESTORE FULL DISK INCLUDING WINDOWS /dev/disk/by-id/ACTUAL_STABLE_ID`で、normalとは一致しません。
PARTUUIDを観測できないほどpartition tableが壊れた場合、toolはfail closedします。自動overrideは
ありません。元backupを保全し、disk復旧担当へ引き継ぎます。

## 復旧後のphysical gate

restore commandの成功だけでは完了しません。

- recovery mediaを抜いてDebianがUEFI bootする。
- 復元DebianのBtrfs UUIDがprofileのgolden値と一致する。
- exercise preflightが合格し、外部route/DNS/radioがない。
- 14 flags、user変更、SSH key、Web改変、log、session stateがgoldenへ戻った。
- Windowsをoffline bootでき、fixture以外のdataがない。
- `manage-bde -status C:`でsystem volumeが`Fully Decrypted`/`0.0%`、
  hibernationが利用不能、`HiberbootEnabled`が`0x0`のまま。
- Debian exerciseでexact Windows PARTUUIDが`/mnt/windows`へ
  `ntfs3`の`ro,nosuid,nodev,noexec`だけでmountされ、停止後はunmountedになる。
- `EFI/Microsoft`と`EFI/debian`の記録がgolden evidenceと一致する。

結果を`evidence.example.json`の実コピーへ記録し、全gateが`passed`になるまで次の参加者へ渡しません。
