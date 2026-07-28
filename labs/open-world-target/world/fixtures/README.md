# Static target fixtures

このtreeはDebian 13のgolden imageへコピーする設定例であり、現在のPCへ
直接適用するinstallerではない。`fixture-manifest.json`の所有者・group・modeを
platform構築工程が適用し、exercise modeの直結NICだけでserviceを起動する。

意図的な弱点は次の6境界に限定する。

1. Apache/PHP診断画面が`target`をshell commandへ連結する。
2. Sambaの`handover`を匿名で読め、演習専用の古い資格情報が残る。
3. NFSがmechanicの`.ssh`をmechanic UIDへall-squashして書き込み可能にする。
4. `lab-foothold`が作れるhookをsudo許可済みhelperがrootで実行する。
5. root timerが`lab-foothold`変更可能なpayloadを実行する。
6. 教材用SUID helperがrendererを安全でない`PATH`解決で実行する。

Web、SMB、NFSは`10.13.37.0/24`へ限定する。SMBはTCP 445だけを待ち受け、
TCP 139は開かない。既知CVE、ブルートフォース、
マルウェア、永続化は使わない。Apache access logはquery stringを含めない。
PAM adapterと固定path inotify watcherもallowlist済みの定数だけをUnix socketへ送り、入力値、
資格情報、ファイル内容、syscall/command/path metadataを保存しない。
各hookはsource scope別HMAC鍵でwire eventを署名し、daemonはtag検証後にtagを
破棄する。鍵の所有権正本は`fixture-manifest.json`、runtime手順は
`telemetry/README.md`に置く。

NFSはv4/TCPだけを使い、export自身を`fsid=0`のpseudo-rootにする。Kali側は
`sudo mount -t nfs4 -o vers=4,proto=tcp 10.13.37.10:/ /mnt/workshop`
で直接mountする。Debian trixieではNFSv4-onlyでもkernel認証cacheのため
`nfs-mountd`自体は必要なので20048へ固定するが、nftablesは直結側でも20048を
dropする。rpcbindはplatformでmaskし、`showmount`を使わない。攻撃側へ公開する
NFS portはTCP 2049だけである。

教材eventの検出は、root所有の`open-world-file-watch.service`がbundleに固定したallowlist pathだけを
Linux inotifyで監視する。
NFS readを含む対象eventは、固定tupleだけをroot-scope鍵で署名してUnix socketへ送る。raw syscall
record、command、任意path、file content、NFS request本文は保存も送信もしない。watcherは
exercise-ready markerがなければ起動せず、署名eventを配信できない場合は失敗する。
`nfs-server.service`はwatcherへ`BindsTo`されるため、その場合はNFSも停止して未記録のまま演習を
続行しない。

Apache、SSH、Samba、NFS、file watcher、root timer、telemetry service/socketは
すべて`open-world-vulnerable.target`へ`PartOf`と`BindsTo`で結ぶ。target停止時だけでなく、
演習中に必須unitまたはtelemetry socketが止まった場合もvulnerable targetをfail-closeで停止する。
これらを通常boot targetへ個別にenableせず、platformのexercise targetからだけ起動する。
maintenanceへ戻る途中で教材用listenerやtimerを残さない。

実機確認ではtarget側の`ss -ltnp`で直結アドレスの445だけがSambaであり139が
存在しないこと、Kali側のport scanでも22/80/445/2049/8080以外が見えないことを
記録する。NFS mountから`ENTRY-NFS.flag`を読むと
`entrance-nfs-workshop`だけが発火することも記録する。

`open-world-root-timer.timer`は常に動くが、golden payloadとの差分があるとき
だけroot専用の経路flagを読み、file watcherが固定教材eventとして経路到達を記録する。sudo helper
とSUID helperも、root制御コードを起動する直前に対応する経路flagを読む。
共通`/root/ROOT.flag`の読み取りを最後の信頼可能な自動イベントとし、それ以後の
Windows調査は自動検出しない。
