# Debian platform

このディレクトリは、専用のDebian 13実機を安全側から演習modeへ切り替え、復旧するための正本です。
対象diskはDebian専用の全disk構成です。初期値は常にdry-runで、実機へ書く操作はlive identity、
完全な確認文、`--apply`が揃わない限り実行しません。

## 所有範囲

- `manifest.json`: Debian release、package、service、port、install fileの固定一覧
- `profile.example.json`: 実機固有のdisk、Debian/ESP PARTUUID、NIC、復旧asset情報
- `templates/`: wired-only network、DHCP-only dnsmasq、nftables、systemd mode
- `open_world_platform/`: overlay生成、inventory、preflight、mode、install、recovery CLI
- `tests/`: hostのdisk/networkへ触れないcontract test

攻撃world、flag、telemetryの内容はここへ重複させません。相互契約は
`manifest.json`の`serviceProviders`とtarget bundle manifestで固定します。

## Fail-closedの順序

Exerciseへの遷移は次の順序を変えません。

1. live `/`、disk by-id、serial、WWN、byte size、Debian/ESP PARTUUIDをprofileと照合する。
2. live OSがDebian 13 amd64/x86_64であることを確認する。
3. lab serviceとmaintenance connectivityをすべて停止する。
4. Wi-Fi、WWAN、Bluetoothをrfkillし、wired以外のNICをdownにする。
5. wiredを`10.13.37.10/24`だけにし、default routeを消す。
6. IPv4 forwardingとIPv6を止め、output dropのnftablesを入れる。
7. 読み取り専用inventoryでisolation preflightを通す。
8. fresh sessionを作り、初めてlab serviceを起動する。
9. service込みのready preflightを通す。失敗時はmarkerを消してmaintenanceへ戻す。

一度でもexerciseへ入ったOSはroot compromise済みとして扱います。信頼済み復旧が終わるまで
maintenance connectivityを再開しません。

## Profileとplatform overlay

`profile.example.json`をコピーし、実機と信頼済み復旧mediaで読んだ値だけを記入します。
`/dev/sda`のような不安定名、推測値、placeholderは拒否されます。

- `/dev/disk/by-id/...`、serial、WWN、byte単位のdisk size
- DebianとESPのPARTUUID
- wired interface名、MAC address、maintenance connectivity owner
- kit ID、復旧media UUID、golden Btrfs UUID、3 assetのSHA-256

```text
python -m open_world_platform.cli validate --profile profile.json

python -m open_world_platform.cli render \
  --profile profile.json \
  --output build/platform-overlay

python -m open_world_platform.cli install \
  --profile profile.json \
  --overlay build/platform-overlay \
  --overlay-sha256 ACTUAL_64_HEX \
  --disk-by-id /dev/disk/by-id/ACTUAL_STABLE_ID \
  --debian-partuuid ACTUAL_DEBIAN_PARTUUID \
  --esp-partuuid ACTUAL_ESP_PARTUUID \
  --confirm "INSTALL PLATFORM /dev/disk/by-id/ACTUAL_STABLE_ID" \
  --inventory evidence/install-inventory.json
```

`render`は空directoryだけを出力先にし、同じ入力から同じtree hashを作ります。`install`も既定は
planだけです。packageはtarget fixtureより先に導入し、overlay適用後はboot quarantineを起動して
lab/connectivity serviceをdisabledにします。手順は
[PREPARE-TARGET.md](../operator/PREPARE-TARGET.md)を正本にします。

## Target bundle

`build-target-bundle`はworld fixtureとtelemetry runtimeを一時directoryで結合し、全fileの
SHA-256・owner・group・modeを`TARGET-BUNDLE.json`へ固定します。配置と設定は同じsourceから
再現し、13個の任意flag本文とsales用synthetic credentialだけはbuildごとに暗号学的乱数で
新規生成します。本文やseedはmanifestへ書かず、生成flagはDebianの宣言済み配置先、
生成credentialはSMB引き継ぎ文書と`installer-private`だけへ入ります。公開guide、
build generator、event HMAC key、Bridge bearer tokenは対象Debianへ保存しません。

```text
python -m open_world_platform.cli build-target-bundle \
  --repo-root ../../.. \
  --output build/target-bundle

python -m open_world_platform.cli verify-target-bundle \
  --bundle build/target-bundle
```

`install-target`も既定はdry-runです。live `/`、disk identity、2 PARTUUID、bundle manifest hash、
完全な確認文が一致した場合だけ適用できます。適用後もlab serviceはdisabledのままにし、
config検査とmaintenance quarantine完了後の最後にfresh-state markerを配置します。

NFSはv4-onlyの2049/TCP、Sambaは445/TCPだけを公開します。dnsmasqは直結EthernetのDHCPだけを
所有し、DNS listener、router/DNS広告、上流resolverを持ちません。公開guideは別originで、
対象Debianが配信しません。

## Preflightとmode

```text
python -m open_world_platform.cli preflight \
  --profile profile.json \
  --mode exercise \
  --stage ready \
  --inventory evidence/exercise-inventory.json

sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to exercise
```

通常bootはmaintenance quarantine、演習時だけ`open-world-exercise.target`を使います。当日の
停止条件は[DAY-OF.md](../operator/DAY-OF.md)に固定します。

## Recovery

`recover`はinstalled Debianから実行できません。次の全条件をlive inventoryで検証します。

- trusted recovery USBからbootしている
- recovery media UUID、kit marker、kit ID、asset hashが一致する
- disk by-id、serial、WWN、sizeが一致する
- normalではDebian/ESP PARTUUIDも一致し、target partitionsがunmountedである
- recovery rootとasset mountが同じ物理USBで、target diskを含まない
- operation固有の完全な確認文が一致する

Normal recoveryはDebian partitionをgolden Btrfs streamから作り直し、golden filesystem UUIDを
読み戻し、`@`、`fstab`、GRUBのstable identityを検証して`EFI/debian`を戻します。
Full recoveryはpartition table、ESP、Debianを含む専用disk全体を上書きする別operationです。
partition tableが壊れていてもstable physical disk identityは省略しません。raw imageのlogical byte
sizeも対象disk sizeと完全一致しなければ`dd`へ進みません。
詳しくは[RECOVERY.md](../operator/RECOVERY.md)を参照してください。

## Automated verification

```text
python -m unittest discover -s tests -v
```

このtestはfixture inventoryと一時directoryだけを使い、`ip`、`nft`、`systemctl`、`mkfs`、
`mount`、`btrfs receive`、`dd`を実行しません。実NIC隔離、実boot、実restoreは別の物理gateです。
