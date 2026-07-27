# Verification: Site Takeover Live USB

検証日: 2026-07-27

この文書は、GitHubへ公開する前のローカル検証記録です。物理USB、実機ノート、
借用Kali、GitHub Actionsから生成した最終ISOは、別ゲートとして扱います。

## Local automated checks

- `npm test`: 21/21 pass
- Bash syntax: pass
- PHP lint: 4/4 pass
- PowerShell parse and safe bootstrap self-test: pass
- GitHub Actions YAML parse: pass
- Codex process-group termination with a spawned child: pass
- Firefox participant flow: pass
  - Advanced all four required stages through the rendered controls
  - Built a team-specific payload
  - Submitted that payload through the vulnerable Web form
  - Verified the changed homepage through the guide
  - Completed the three-question causal debrief
- Firefox layout smoke: target, guide, and staff tool pass at 360x800,
  1280x720, and 1366x768 without horizontal overflow
- Visible form-control names: pass

## Local ISO

- File: `site-takeover-live-amd64.iso`
- Size: `1218756608` bytes
- SHA-256:
  `0b27a41d72c2b2b03754d74f24c766eed3ad38a003444bf168bd7a3c80c60255`
- External `.sha256` match: pass
- El Torito BIOS entry: present
- El Torito UEFI entry: present

このISOは未コミット状態のローカルソースから作った機能検証用です。GitHub Actionsの
最終成果物は、Releaseへ添付されたISOとSHA-256を改めて照合します。

## Virtual-machine proof

Debian Liveの標的VMはVirtualBox内部ネットワークだけを持ち、別の攻撃側VMから
その内部ネットワーク経由で確認しました。攻撃側のビルドVMにはhypervisor上の
NATアダプターも残っていたため、この実測は標的側の封じ込めと攻撃経路の証拠であり、
最終Kali側の隔離合格には使いません。

- ディスクなし起動: pre-review ISOで19 preflight checks pass
- Live media: `/run/live/medium` source and filesystem are both `tmpfs`
- Exercise network: no Wi-Fi, DNS, or default route
- Services: HTTP and DHCP active only after the safety gate
- Scan from attacker: TCP 80 open; TCP 22 and 443 closed
- Command execution: `whoami` returns `www-data`
- Required goal: homepage notice changed to `SECURITY TEST SUCCESS: FINAL VM`
- Optional manager note: readable through the intended vulnerable boundary
- Optional root proof: readable through the intended bonus boundary
- Maintenance mode: HTTP/DHCP stopped; Codex CLI `0.145.0` available with
  temporary `/run` credentials and no logged-in account
- Return to exercise: preflight passes and HTTP returns
- Reboot: changed notice returns to its original text
- Disk present at boot: `DISK DETECTED - STOP`; HTTP unavailable
- Disk hot-plugged during exercise: guard stops HTTP and blocks the lab
- Disk removed again: guard can return to `EXERCISE READY`

## Visual evidence

- `qa/screenshots/site-desktop.png`
- `qa/screenshots/site-360.png`
- `qa/screenshots/guide-desktop.png`
- `qa/screenshots/guide-360.png`
- `qa/screenshots/guide-success.png`
- `qa/screenshots/firefox-guide-success-final.png`
- `qa/screenshots/firefox-site-360-final.png`
- `qa/screenshots/target-ready-final.png`
- `qa/screenshots/target-disk-blocked-final.png`
- `qa/screenshots/target-disk-hotplug-block-final.png`
- `qa/screenshots/target-maintenance-codex-final.png`
- `qa/screenshots/target-exercise-return-final.png`

## Draft prerelease proof

- Tag: `site-takeover-live-v0.1.0-rc1`
- Target commit: `b7b9acaa7df430aa92a7447e4ba244d6bc9a6d11`
- State: draft and prerelease; not published
- Exact ISO SHA-256:
  `f6d5abfe122aa9f32a19001390ff9d312b26417aa3ae2f18fe2b352e68fc337f`
- Exact ISO size: `1218756608` bytes
- GitHub assets: ISO, external SHA-256, and BIOS/UEFI boot report uploaded
- GitHub re-download: SHA-256 match
- Embedded source metadata: target commit and `dirty=false`
- Exact-ISO VM: 22 preflight checks pass, 0 fail
- Exact-ISO attack flow and reboot reset: pass

GitHub-hosted Actions stopped before its first step because the account reported a
payment/spending-limit gate. The draft asset was therefore built from the exact
commit on the verified Debian 13 VM. An Actions-produced artifact remains a
separate external gate.

## Gates still requiring physical or external evidence

- The BUFFALO USB is connected and passes an all-available-space H2testw
  write-and-verify run with zero errors.
- The GitHub Actions workflow passes from the committed branch.
- The target laptop boots the USB, reports RAM media, sees no internal SSD,
  allows USB removal, and reaches `EXERCISE READY`.
- Both the borrowed Kali laptop and the fallback Kali environment pass
  `operator/KALI-PREFLIGHT.md`.
