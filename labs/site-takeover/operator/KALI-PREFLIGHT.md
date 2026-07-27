# Kali事前確認

借用KaliにLive USBを挿さない。演習中は標的ノートとの直結LANだけを使い、KaliのWi-Fi、会社LAN、VPNを切る。

## Windows上のKali VMを使う場合

設定中は標的とのLANケーブルも抜いたままにする。VirtualBoxを開く前に、Windows側の
Wi-Fi、VPN、モバイルホットスポット、インターネット接続の共有を切り、ドックや別の
LANケーブルも外す。会社LANへつながったままVMを起動しない。標的画面が
`CONNECT LAN`になった後にだけ、Kali VMを使うノートと標的ノートを直結する。

管理者PowerShellは不要である。Windows側で、標的へつないだEthernet以外に
通信中の接続とデフォルトゲートウェイがないことを読む。

```powershell
Get-NetAdapter | Where-Object Status -eq 'Up'
Get-NetIPConfiguration |
  Where-Object { $null -ne $_.IPv4DefaultGateway } |
  Format-Table InterfaceAlias,IPv4Address,IPv4DefaultGateway
```

2つ目のコマンドが何も返さない状態にする。VirtualBoxのKali VM設定は次に固定する。

- アダプター1だけを有効にする
- 接続方法は`ブリッジアダプター`
- 名前は、標的へ直結した物理Ethernetだけを選ぶ
- `ケーブル接続`を有効、プロミスキャスモードは`拒否`
- アダプター2〜4は無効
- NAT、NATネットワーク、ホストオンリー、内部ネットワークを追加しない

USB Ethernetアダプターを使う場合も、Windowsに見えているその物理アダプターへ
ブリッジする。Kali VMを起動した後は、下のゲスト内確認を全て行う。Kali側に
デフォルト経路が残る場合は、VirtualBox設定かWindows側の接続が違うため中止する。

終了時は標的とのLANを抜いてKali VMを停止してから、VirtualBoxとWindowsの接続を
借用元の状態へ戻す。

## ケーブルを挿す前

有線LANの機器名を調べる。

```bash
nmcli device status
```

借用元の接続設定は削除せず、Wi-FiとVPNを一時的に切る。

```bash
nmcli radio wifi off
ip -4 route show default
```

`ip -4 route show default`が何も返さないことを確認する。残る場合は、その接続が会社LANやVPNではないか確認して切る。

この時点では標的とのLANケーブルを挿さない。標的画面の `CONNECT LAN` を待つ。

## `CONNECT LAN`の後

標的ノートとKaliをLANケーブルで直結する。直結した有線LANに次の範囲のアドレスが付けばよい。

```bash
ip -br address
```

```text
10.13.37.100〜10.13.37.150
```

経路、デフォルト経路、必要な道具、2つのページを確認する。

```bash
ip route get 10.13.37.10
ip -4 route show default
command -v firefox nmap curl
curl --noproxy '*' --fail http://10.13.37.10/
curl --noproxy '*' --fail http://10.13.37.10/start/
```

次を全て満たせば合格。

- `10.13.37.10`への経路が直結した有線LANを向いている
- デフォルト経路が表示されない
- `firefox`、`nmap`、`curl`の場所が表示される
- 2回の`curl`がHTMLを返す
- Firefoxで店のサイトとガイドが開く
- インターネット、会社LAN、VPNへつながっていない
- KaliへLive USBを挿さなくても進められる

確認対象は `10.13.37.10` だけである。会社のIPアドレスや第三者サイトをスキャンしない。

## DHCPでアドレスが付かない場合

`<有線LAN名>`を `nmcli device status` で見た名前へ置き換える。

```bash
sudo nmcli connection add \
  type ethernet \
  ifname '<有線LAN名>' \
  con-name site-lab-attacker \
  ipv4.method manual \
  ipv4.addresses 10.13.37.100/24 \
  ipv4.never-default yes \
  ipv4.ignore-auto-dns yes \
  ipv6.method disabled
sudo nmcli connection up site-lab-attacker
```

今回は攻撃側を1台に限定する。固定IPを作ったら、終了時に必ず削除する。

## Firefoxだけ開かない場合

組織用プロキシ設定が残っている可能性がある。Firefoxのネットワーク設定を演習中だけ「プロキシーを使用しない」にする。終わったら借用時の設定へ戻す。

## 終了時

固定IPを作った場合だけ削除する。

```bash
sudo nmcli connection delete site-lab-attacker
```

標的とのLANケーブルを抜く。Wi-FiとVPNは借用元の運用に従って戻す。

```bash
nmcli radio wifi on
```
