# Day-of operation

## 開始前

標的とKaliの電源を入れる前に次を目視します。

- recovery USB、backup disk、会社LAN cableは標的から外れている。
- 接続は標的とKaliを結ぶ専用Ethernet 1本だけ。
- 完全オフラインならKali実機のWi-Fi、Bluetooth、他Ethernetをoff。
- 公開guideを使う場合だけKaliの別Wi-FiまたはVMの別WAN adapterを外向きHTTPS用に使い、
  IPv4/IPv6 forwarding、NAT、Ethernet↔WAN転送を無効にする。
- Kali VMのUSB Ethernetは専有し、host、bridge、host-onlyと共有しない。
- 標的はDebian maintenanceでbootし、Windowsやexercise serviceは起動していない。
- 参加者へ「指定標的`10.13.37.10`以外をscanしない」と説明した。

対象ノートのDebianで、mode切替とready preflightの前にlive identityを読みます。

```text
. /etc/os-release
printf 'ID=%s VERSION_ID=%s\n' "$ID" "$VERSION_ID"
dpkg --print-architecture
uname -m
```

`ID=debian VERSION_ID=13`、`amd64`、`x86_64`以外なら中止します。これはKaliやrecovery USBの
判定ではなく、演習対象Debianだけに対するgateです。

Kali側は`ip address`、`ip route`、`cat /etc/resolv.conf`を読み、exercise Ethernetにdefault
gatewayやDNSが付いていないことを確認します。公開guide利用時のdefault route/DNSは別WAN interfaceだけに
属し、`net.ipv4.ip_forward=0`、IPv6 forwarding無効、NAT ruleなしである証跡を残します。VM host側も
USB Ethernetがhostと共有されていない証跡を残します。

## Exerciseへ入る

最初はplanだけを表示します。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to exercise
```

planが「lab停止→maintenance connectivity停止→radio block→他NIC down→wired設定→sysctl→
exercise firewall」の順で、NIC名がprofileと一致するときだけ適用します。
直結Ethernetの設定はmode controllerの直接`ip`操作だけが所有します。
`systemd-networkd.service`がmasked/inactiveで、未使用の`.network`設定が直結NICを管理していないことも
確認します。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to exercise \
  --confirm "ENTER EXERCISE MODE" \
  --apply
```

続けてlive preflightを実行します。

```text
sudo open-world-platform preflight \
  --profile /etc/open-world-lab/profile.json \
  --mode exercise \
  --stage ready
```

`passed: true`に加え、Kaliから次を確認します。

- DHCP addressは`10.13.37.100`〜`10.13.37.199`。
- DHCPでrouter、DNS server、search domainを受け取らない。
- `ping 10.13.37.10`へ応答する。
- exercise Ethernetにはdefault routeとDNSがない。
- scan対象は`10.13.37.10`だけで、公開TCP portは22、80、445、2049、8787、
  公開UDP portは67だけ。53と8080はTCP/UDPとも閉じている。
- `nmbd.service`はinactive/maskedで、139/TCPと137-138/UDPは待受しない。
- target内部ではNFSv4 auth cache用mountdが20048/TCPで待受してもよいが、
  `rpcbind.service`/`.socket`とstatd unitはmasked、111/random NSM portは非待受、20048は
  直結側nftablesでdropされ、Kali scanへ公開されない。
- targetから外部IP、外部DNS、会社LANへ到達しない。

公開guideを使う場合は、Kaliだけで実在するVercel URLとBridgeを使います。対象Debianで生成した
`TELEMETRY_BRIDGE_TOKEN`は、本文をlogや証跡へ残さない運営者管理の経路でKaliへ渡します。
`BRIDGE_DEPLOYMENT_TOKEN`もroot-only環境で用意し、次のplaceholderを実値へ置き換えます。

```text
export LAB_PUBLIC_ORIGIN='https://exam-server-one.vercel.app/lab'
export BRIDGE_CLOUD_ORIGIN='https://exam-server-one.vercel.app'
export BRIDGE_TARGET_ORIGIN='http://10.13.37.10:8787'
read -rsp 'Cloud deployment token: ' BRIDGE_DEPLOYMENT_TOKEN
export BRIDGE_DEPLOYMENT_TOKEN
printf '\n'
read -rsp 'Target telemetry token: ' BRIDGE_TARGET_TOKEN
export BRIDGE_TARGET_TOKEN
printf '\n'
cd labs/open-world-target/bridge
npm start
```

標準出力のpairing codeとviewer URLだけを参加者へ渡し、viewer URLのoriginが
`LAB_PUBLIC_ORIGIN`と一致することを確認します。tokenは表示・転記しません。Debianへ公開guideの
DNS名、build成果物、server、serviceを置きません。

完全オフライン演習ではBridge/Vercelを使わず、build済みguideをKali上のloopbackだけで起動します。
同じ`BRIDGE_TARGET_TOKEN`をserver側だけに保持し、ブラウザへ渡しません。

```text
cd REPOSITORY_ROOT
read -rsp 'Target telemetry token: ' BRIDGE_TARGET_TOKEN
export BRIDGE_TARGET_TOKEN
printf '\n'
LAB_GUIDE_HOST=127.0.0.1 \
LAB_GUIDE_PORT=8080 \
LAB_TELEMETRY_HOST=10.13.37.10 \
LAB_TELEMETRY_PORT=8787 \
node apps/lab-guide/server/index.mjs
```

Kali自身のブラウザで`http://127.0.0.1:8080/?local=1`を開きます。このlocal-only fallbackを
`0.0.0.0`、Kali Ethernet address、Debian、参加者LANへbindしません。

target側のready preflightでは`open-world-file-watch.service`、dnsmasqがactiveで、
dnsmasq leaseの専用directory/file権限、exact single-config override、`port=0`、空のrouter/DNS
optionが正しくなければ失敗します。file watcherは固定allowlist pathのinotify eventを
固定教材eventへ変換するだけで、raw syscall record、command、任意path、file contentを保存・配信しません。
watcherまたはtelemetry socketが起動しない場合は自動eventを推測で補完せず、演習を止めます。
同じpreflightはprofileのWindows PARTUUIDが`/mnt/windows`へ`ntfs3`の
`ro,nosuid,nodev,noexec`でmountされ、`mnt-windows.mount`がactiveであることも要求します。
参加者はWindows bonusをこのread-only mountから探します。

active probeは実機証跡であり、自動testの代用にしません。

## 停止条件

次のどれかがあれば参加者操作を止め、LAN cableを抜きます。

- target、またはKaliのexercise Ethernetに外部/default routeが現れた。
- targetのWi-Fi、WWAN、Bluetooth、別NICがactiveになった。
- Kaliでforwarding、NAT、exercise Ethernet↔WAN転送が有効になった。
- 想定外portまたは会社LAN/第三者addressへのpacketを観測した。
- paired guideまたはKali local fallbackと標的状態が一致せず、誤対象の可能性がある。
- target disk、Windows、EFIへ想定外の書き込みが見えた。
- root取得後に次の参加者へそのまま渡そうとしている。

## Maintenanceへ戻す

root取得後のDebian内でresetやclean-upを行いません。演習を止めるためのmode遷移だけを行い、
その後は信頼済みrecovery mediaへbootします。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to maintenance \
  --confirm "ENTER MAINTENANCE MODE" \
  --apply
```

vulnerable、telemetry service/socket、file watcher、DHCP、nmbd、
`mnt-windows.mount`がすべてinactiveで
quarantineになったことを確認します。これは封じ込めと停止のためだけで、exercise後のOSを
信頼済みmaintenance環境へ戻す操作ではありません。任意のroot payloadが残り得るため、このbootでは
Wi-Fiや他の外部接続を絶対に有効化せず、そのまま電源を切って信頼済みrecovery mediaからrestoreします。

次の操作は、exercise開始前またはtrusted recovery直後のclean golden stateで更新が本当に必要な場合だけ
使います。未消費fresh markerとsession/state不在が必須で、exercise後は実行禁止です。
実行前に標的とKaliを結ぶ専用Ethernet cableを物理的に両端から抜き、link LEDが消えたことを
確認します。profileのwired NICがdown、carrierなし、addressなしで、NetworkManagerの
`unmanaged-devices`対象になっていなければ`connectivity-on`は拒否されます。外したcableを
保守接続中に挿し直しません。
`systemd-networkd.service`もmasked/inactiveのままにし、direct `ip` ownerと競合する
`.network`設定を再導入しません。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to connectivity-on \
  --confirm "ENABLE MAINTENANCE CONNECTIVITY" \
  --apply
```

planの先頭がprofile wired NICのdown/address flushで、その後にhost firewall、Wi-Fi、
NetworkManagerの順であることも確認します。更新終了後は`connectivity-off`でWi-Fiを止め、
default routeと外部DNSが消えた証跡を取ります。
次回演習用golden restoreは[RECOVERY.md](RECOVERY.md)に従います。
