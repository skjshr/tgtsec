# Physical verification matrix

software testは実機の代わりになりません。各行をfresh restoreから開始し、root取得後はそのDebianを
再利用せず、次の行の前にnormal recoveryを通します。

| ID | Entrance | Foothold | Root path | Status |
|---|---|---|---|---|
| WEB-SUDO | Web diagnostics | `www-data` | sudo helper | NOT RUN |
| WEB-TIMER | Web diagnostics | `www-data` | root timer | NOT RUN |
| WEB-SUID | Web diagnostics | `www-data` | unsafe PATH SUID | NOT RUN |
| SMB-SUDO | SMB backup | `sales` | sudo helper | NOT RUN |
| SMB-TIMER | SMB backup | `sales` | root timer | NOT RUN |
| SMB-SUID | SMB backup | `sales` | unsafe PATH SUID | NOT RUN |
| NFS-SUDO | NFS share | `mechanic` | sudo helper | NOT RUN |
| NFS-TIMER | NFS share | `mechanic` | root timer | NOT RUN |
| NFS-SUID | NFS share | `mechanic` | unsafe PATH SUID | NOT RUN |

各rowの合格証跡:

- recovery kit manifest hashとnormal recovery結果
- exercise preflight JSON
- target/KaliのNIC、route、DNS、rfkill状態
- 許可portだけのscan結果
- SMBは445/TCPだけで、nmbdがinactive/masked、139/TCPと137-138/UDPが非待受である証跡
- dnsmasqの実効userが`dnsmasq`で、lease directory/fileが`dnsmasq:root 0750`/`0640`であり、
  DHCPがaddressだけを配りrouter、DNS server、search domainを広告しない証跡
- dnsmasqが`port=0`でTCP/UDP 53をlistenせず、外向きDNS packetを送らない証跡
- rpcbind service/socketとstatd unitがmasked、111/random NSM非待受、mountd/20048が直結側から到達不能、
  NFSv4/2049だけが利用可能である証跡
- `open-world-nfs-watch.service`がactiveで、NFS経由のflag readを一度だけ自動event化した証跡
- `open-world-file-watch.service`がactiveで、固定allowlist pathだけのinotify eventを一度だけ
  固定教材event化した証跡。raw syscall record、command、任意path、file contentは保存しない
- 実UID/GIDで、Web/SMB low emitterはlow keyだけ、telemetry daemonはlow/root両keyを読め、
  一般userはどちらも読めない権限証跡（鍵本文は保存しない）
- foothold userとroot identityを示すsynthetic evidence code
- 入口、foothold、root clue、root route、common rootのflag event
- `LAB_PUBLIC_ORIGIN`とpairing code、またはKali local-only fallbackへの2秒以内の反映時刻
- target telemetryのstate/eventsと固定操作が正しいBearerなしでは401になる証跡
- maintenance遷移とrestore後の残留検査

raw command、HTTP parameter、credential、flag本文、terminal historyは証跡へ保存しません。event ID、
node ID、evidence code、timestamp、写真/画面の保管先だけを記録します。

全体gate:

| Gate | Status |
|---|---|
| Public pinned anonymous clone + Codex clean rebuild and residue check | NOT RUN |
| Kali Firefox live current state / choices / explanations | NOT RUN |
| Second-operator reproduction | NOT RUN |
| Dedicated full-disk Debian 13 install | NOT RUN |
| Debian 13 amd64 live identity (`ID=debian`、`VERSION_ID=13`、`amd64`、`x86_64`) | NOT RUN |
| Exercise wired-only isolation | NOT RUN |
| dnsmasq DHCP-only / DNS listener disabled | NOT RUN |
| Target telemetry Bridge bearer authentication | NOT RUN |
| SMB TCP/445 only and nmbd masked | NOT RUN |
| dnsmasq lease runtime permissions | NOT RUN |
| NFSv4-only/rpcbind socket isolation | NOT RUN |
| NFS watcher event delivery | NOT RUN |
| Event-key access by installed UID/GID | NOT RUN |
| Fixed-path file watcher event delivery | NOT RUN |
| Maintenance direct-link cable disconnected and unmanaged | NOT RUN |
| systemd-networkd masked; direct `ip` is sole Ethernet owner | NOT RUN |
| Maintenance Wi-Fi firmware and tethering | NOT RUN |
| 9 route combinations | NOT RUN |
| 13 optional flags reset after recovery | NOT RUN |
| Debian normal recovery | NOT RUN |
| Golden Debian Btrfs UUID preserved | NOT RUN |
| Full-disk fallback rehearsal | NOT RUN |

`NOT RUN`、`BLOCKED`、`FAILED`を`PASSED`として扱いません。写真やlogのない口頭確認も合格にしません。
