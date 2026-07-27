# Live USBを検査して作る

このUSBは、標的ノートを一時的な脆弱Webサーバとして起動するために使う。DebianをSSDへインストールせず、Windows、パーティション、BitLockerを変更しない。

現在のBUFFALO USBはWindowsで `Full Repair Needed` と報告されている。正常な16GB以上のUSBへ交換するのが第一選択である。同じUSBを使う場合は、以下の全容量検査でエラー0件になった場合だけ採用する。

## 1. 破壊操作の前提

ここからのUSB検査とISO書き込みは、対象USBの全データを消す。

- USB内のファイルが不要だと本人が確認する
- 内蔵SSD、外付けSSD、別のUSBを可能な限り外す
- 管理者PowerShellで物理ディスク番号、型番、シリアル、バイト単位の容量を二人で読む
- 表示された同一性確認文字列を本人が入力した場合だけ初期化する

`company-bootstrap.ps1`はUSBを読み取って表示するだけであり、この破壊操作は行わない。

## 2. 全容量検査用にUSBを初期化する

先に [COMPANY-SETUP.md](COMPANY-SETUP.md) のwinget手順で導入したH2testwを使う。
USBへツールを保存しない。H2testwが導入されていない場合は、この文書内で別経路から
取得せず会社準備へ戻る。

USBだけを挿し、管理者PowerShellで次を実行する。

```powershell
Get-Disk |
  Sort-Object Number |
  Format-Table Number,FriendlyName,SerialNumber,UniqueId,BusType,Size,HealthStatus,OperationalStatus

$UsbDiskNumber = [int](Read-Host '消去するUSBのDisk Number')
$usb = Get-Disk -Number $UsbDiskNumber

if ($usb.BusType -ne 'USB' -or $usb.IsBoot -or $usb.IsSystem) {
  throw 'USB以外、起動ディスク、システムディスクは消去できません。'
}
if ($usb.IsOffline -or $usb.IsReadOnly) {
  throw 'オフラインまたは読み取り専用です。解除せず、このUSBを交換してください。'
}

$serial = ([string]$usb.SerialNumber).Trim()
if ([string]::IsNullOrWhiteSpace($serial)) {
  $serial = ([string]$usb.UniqueId).Trim()
}
if ([string]::IsNullOrWhiteSpace($serial)) {
  throw 'シリアルとUniqueIdを確認できないため、このUSBは消去しません。'
}
$identity = 'ERASE|DISK={0}|MODEL={1}|SERIAL={2}|BYTES={3}' -f `
  $usb.Number,$usb.FriendlyName,$serial,$usb.Size

Write-Host $identity
$typed = Read-Host '本当にこのUSBを消去する場合だけ、上の1行を正確に入力'
if ($typed -cne $identity) {
  throw '一致しないため、何も変更せず中止しました。'
}

Clear-Disk -Number $UsbDiskNumber -RemoveData -RemoveOEM -Confirm:$true
Initialize-Disk -Number $UsbDiskNumber -PartitionStyle GPT
$partition = New-Partition -DiskNumber $UsbDiskNumber -UseMaximumSize -AssignDriveLetter
$volume = Format-Volume -Partition $partition -FileSystem exFAT `
  -NewFileSystemLabel USB_HEALTH_TEST -Confirm:$false

Write-Host ('H2testw target: {0}:\' -f $volume.DriveLetter)
```

`Clear-Disk`の確認でも、対象番号をもう一度見る。確認文字列が空、型番が不明、容量が予想と違う場合は続けない。

## 3. 全領域を書いて読み戻す

1. H2testwを起動し、Englishを選ぶ。
2. `Select target`でPowerShellが表示した `USB_HEALTH_TEST` のドライブ文字だけを選ぶ。
3. `all available space`を選ぶ。
4. `Write + Verify`を開始し、完了までUSBを抜かない。
5. `New-Item -ItemType Directory -Force C:\lab\usb-evidence` をPowerShellで実行する。
6. 結果をテキストで `C:\lab\usb-evidence\h2testw.txt` に保存する。

合格は「全available spaceのWriteとVerifyが完了」「data lost/corrupted/overwrittenが0」「errorが0」の全てを満たす場合だけである。容量が製品表示から大きく不足する、中断する、1件でもエラーが出る場合はUSBを交換する。警告歴のあるUSBを再試験だけで当日の唯一の媒体にはしない。

H2testwのテストファイルは削除しなくてよい。後のRufusがUSB全体を上書きする。

## 4. ISOと実際のチェックサムを照合する

private draft prereleaseから、同じリリースにある次の3ファイルを同じ空フォルダへ保存する。

```text
site-takeover-live-amd64.iso
site-takeover-live-amd64.iso.sha256
site-takeover-live-amd64.boot.txt
```

そのフォルダでPowerShellを実行する。

```powershell
$isoName = 'site-takeover-live-amd64.iso'
$checksumName = 'site-takeover-live-amd64.iso.sha256'
$lines = @(Get-Content ".\$checksumName" | Where-Object {
  $_ -match '\s+\*?site-takeover-live-amd64\.iso$'
})
if ($lines.Count -ne 1) {
  throw 'チェックサムファイルに対象ISOが1件だけ記載されていません。'
}

$expected = (($lines[0].Trim() -split '\s+')[0]).ToUpperInvariant()
$actual = (Get-FileHash ".\$isoName" -Algorithm SHA256).Hash.ToUpperInvariant()
if ($expected -notmatch '^[0-9A-F]{64}$' -or $actual -cne $expected) {
  throw "SHA-256不一致: expected=$expected actual=$actual"
}
Write-Host "SHA-256 OK: $actual"
```

`SHA-256 OK`が出ない場合はUSBへ書き込まない。`.boot.txt`はビルド時にBIOSとUEFIの両起動項目を検査した記録であり、実機起動成功の代わりにはならない。

## 5. RufusでLive ISOを書き込む

1. [COMPANY-SETUP.md](COMPANY-SETUP.md) のwinget手順で導入したRufusを開く。
2. 「デバイス」が全容量検査で記録したUSBの型番と容量に一致することを二人で確認する。
3. `site-takeover-live-amd64.iso`を選ぶ。
4. hybrid imageの方式を聞かれたらDDイメージモードを選ぶ。
5. Rufusの最終警告でも対象USBを確認し、本人が開始する。
6. 完了後にWindowsからフォーマットを求められてもキャンセルする。
7. USBを安全に取り外す。

これで「書き込み済み」であり、「実機検証済み」ではない。[DAY-OF.md](DAY-OF.md)の実機確認が合格して初めて当日用になる。

## 物理検証記録

次を実測して記録する。空欄は未検証を意味する。

```text
実施日:
USB Disk Number / 型番 / シリアル / 容量:
H2testw Write + Verify: PASS / FAIL
ISO SHA-256: PASS / FAIL
Rufus DD write: PASS / FAIL
対象ノート型番:
UEFIでSSD無効化: PASS / FAIL
USB取り外し後のdiskless判定: PASS / FAIL
直結LANとWeb表示: PASS / FAIL
```
