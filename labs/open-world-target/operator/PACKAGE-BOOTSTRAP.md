# Offline package bootstrap

Platform overlayがまだないclean Debianでは、maintenance targetもquarantine tableも存在しません。
この段階でtetheringやLANを使う手順はsupportedではありません。公式Debian 13 amd64の完全な
DVD set、または同じsigned Debian repositoryから組織内で作ったread-only offline apt mediaだけを
使います。DVD 1枚だけに全packageがあるとは仮定しません。

## Media gate

運営用workstationでDebian公式のchecksum/signatureを検証し、必要なDVDをすべて用意します。
対象ノートではinstaller時からnetwork mirrorを選ばず、Ethernetを抜き、Wi-Fi/WWAN/Bluetoothを
offにします。会社LAN、家庭LAN、tetheringへ接続しません。

## Daemon autostart guard

`/usr/sbin/policy-rc.d`が既に存在する場合は上書きせず中止し、由来を調査します。存在しない場合だけ、
このdirectoryの`policy-rc.d`を対象へcopyし、内容を目視してから次を実行します。

```text
sudo install -o root -g root -m 0755 policy-rc.d /usr/sbin/policy-rc.d
```

各公式DVDを`apt-cdrom add`で登録し、platform overlay内の
`usr/local/share/open-world-lab/packages.txt`にあるpackageをoffline mediaから導入します。
aptがnetwork sourceを要求したら接続せず中止し、次の署名済みDVD/mediaを用意します。

package導入後もcable/radioはoffのまま、package serviceをすべて停止します。特にApache、SSH、
Samba (`smbd`/`nmbd`)、NFS、dnsmasq、rpcbind/statd、NetworkManager、wpa_supplicant、
systemd-resolved、`open-world-file-watch.service`がactiveでないことを確認します。overlay適用前に
競合するnetwork ownerとraw audit consumerも一時停止します。`auditd.service`が導入済みの場合だけ
`service`経由で停止し、次の確認がすべて`inactive`（または未導入の`auditd`だけ`not-found`）になるまで
inventoryへ進みません。overlay適用時にこれらはmaskされます。

```text
sudo systemctl stop systemd-networkd.service systemd-journald-audit.socket
if systemctl cat auditd.service >/dev/null 2>&1; then sudo service auditd stop; fi
systemctl is-active systemd-networkd.service systemd-journald-audit.socket auditd.service
```

全非loopback NICをdownにし、default route、外部DNS、非loopback listenerがない状態をinventoryへ保存します。

```text
sudo python -m open_world_platform.cli inventory \
  --profile ACTUAL_PROFILE.json \
  --boot-environment installed-debian \
  --output ACTUAL_BOOTSTRAP_INVENTORY.json
```

inventoryの`packages`がmanifest全件`true`でなければplatform installは拒否します。初回だけは
`bootEnvironment=installed-debian`を許しますが、exact disk/root/PARTUUIDに加えて上記offline状態を
すべてlive確認できる場合に限ります。さらにinventoryの`platformIdentity`が
`ID=debian`、`VERSION_ID=13`、`dpkgArchitecture=amd64`、`kernelMachine=x86_64`でなければ拒否します。
まずdry-runを確認し、その後に完全な確認文と`--apply`を使います。
適用は最初にquarantineを起動し、以後の通常操作は`installed-debian-maintenance`だけを許します。

overlay適用が成功し、boot quarantineとmaintenance targetがactive、全lab/connectivity serviceが
inactiveであることを確認した後だけ、一時`policy-rc.d`が配布版とbyte-for-byte同じことを比較して
削除します。比較できない、途中で失敗した、serviceが起動した場合は削除せず、networkを接続せずに
記録を保全します。
