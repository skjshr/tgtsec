# Task Contract: ExamServer Open World Lab v1

## Goal

常時閲覧できるExamServerの公開ラボと、Kali Bridge経由でDebianの許可済み教材イベントに追従するライブ演習を、3入口、3root経路、14 flags、信頼済み復旧と一つの再現可能な体験として実装し、補助情報はユーザーがラベル付きの引き手を操作した時だけ一枚ずつ見せる。

## Inputs

- Target: UEFI/GPT、Windowsとのデュアルブート、Debian用80GB以上の未割当領域を確保できるノートPC
- Attacker: Kali実機、またはUSB Ethernetを専有し他NICを外したKali VM
- Network: target `10.13.37.10/24`、直結Ethernet、target DHCP、Debianは外部経路なし。ライブ利用時だけKaliは別NICからVercelへ外向きHTTPS接続する。
- Audience: IT/ターミナル初心者、1チーム1〜3人
- Session: 標準経路30〜60分、別ルート再挑戦あり
- Recovery: 演習中は外して保管する信頼済みUSBとbare-metal backup

## Removals

- 旧`labs/site-takeover`を現行導線、構築、設計正本から外す。
- Live USBを通常起動方式として使わない。
- vanilla guideの出力貼付け中心モデルを削除する。
- Drupal、DVWA、既存OVAを新世界へ移植しない。

## World contract

- Theme: 架空の中古バイク販売・整備チェーン「風切モータース」
- Entrances:
  1. Web staff diagnostics command injection → `www-data`
  2. Anonymous SMB backup disclosure + credential reuse → `sales`
  3. Misconfigured NFS share → `mechanic` SSH foothold
- Root paths:
  1. Misconfigured `sudo` maintenance helper
  2. Group-writable root systemd timer payload
  3. Training-only SUID helper with unsafe PATH resolution
- All three footholds can reach all three root paths.
- Flags: entry 3、foothold 3、root clue 3、root route 3、common root 1、Windows 1。

## Telemetry contract

- Record only allowlisted lab event kinds, node IDs, source IDs, evidence codes, and timestamps.
- Never record raw commands, raw HTTP parameters, file contents, credentials, tokens, or arbitrary terminal history.
- Services emit to a root-owned Unix socket; the event daemon validates source/event combinations.
- Debian telemetry exposes only discovered facts, unlocked hypotheses, graph projection, hint state, progress, and sanitized recent events to the direct LAN.
- Kali Bridge reads that public projection and sends monotonic snapshots to the cloud over outbound HTTPS. It never forwards a target port or arbitrary target traffic.
- The public website has a no-session browse mode. A short-lived pairing flow switches it to the paired live projection.
- SSE is the normal browser update path; state polling is the fallback.
- Manual flag submission remains local-only and is not sent through the public cloud.
- Root completion is the last trustworthy automatic event.

## Platform contract

- Exercise mode exposes only required lab services on wired Ethernet and gives Debian no external route.
- Public guide URL is `https://exam-server-one.vercel.app/lab`; its live API namespace is `/api/lab`. The reserved `.test` domain is not used publicly. The target is reached from Kali at `10.13.37.10` and is never the guide host.
- Kali may use Wi-Fi for the Bridge, but IPv4/IPv6 forwarding, NAT, and cross-interface forwarding must remain disabled.
- Maintenance mode keeps vulnerable services stopped before Wi-Fi or update tooling is enabled.
- Windows is offline, sacrificial, and contains only fixture data and its hidden flag.
- Disk-writing setup/recovery commands are dry-run or fail closed until exact disk identity, partition UUID, confirmation phrase, and image hash are supplied.
- Root-acquired Debian is never reset from itself.

## Done criteria

- New contracts and active README describe only the open-world lab.
- Guide implements browse, waiting, live, loading, reconnecting, selected, hint, success, and local-only fallback states.
- A visitor can understand the lab and view its public world without a target or session.
- A Kali Bridge can create a short-lived session, upload a sanitized projection, and make a paired browser update without reload.
- PLAY、OPS、FOCUSの3テーマはruntimeで切替・保存でき、テーマ変更で教材状態を失わない。
- 初期画面は現在目標、世界／仮説、主要操作だけを表示し、接続、事実、調査／ヒント、履歴、見た目は名称の分かる引き手からだけ開く。
- 補助情報は同時に一枚だけ表示し、Escape、背景操作、閉じる操作で収納でき、元の引き手へfocusが戻る。
- Telemetry state machine and API pass unit/integration tests without leaking forbidden data.
- Static target fixtures implement all 3 entrances, 3 root paths, and 14 logical flags.
- Nine route combinations have automated contract tests and operator verification procedures.
- Platform includes deterministic install/config generation, exercise/maintenance mode controls, network isolation checks, and recovery media workflow.
- Browser verification passes Firefox-compatible desktop/narrow flows with no console errors or horizontal overflow.
- `design-qa.md` compares source and implementation at matching viewport and ends with `final result: passed`.
- Physical dual-boot, actual exploit execution, actual Windows boot, and actual recovery remain explicitly incomplete until recorded on the target notebook.

## Surprise ledger

- The old single-route lab is removed from active use instead of being migrated.
- Root is real Debian host root; Windows safety comes from sacrificial contents and trusted external recovery, not containment.
- The guide is hosted publicly; only sanitized state projections and connection metadata reach the cloud.
- Automatic detection is event-based and privacy-bounded, not full command monitoring.
- Live mode requires Kali internet access while Debian remains isolated. Fully offline sessions use the local telemetry API without Vercel.
- 旧三列レイアウトとモバイルでの全パネル縦積みは廃止し、desktopはside drawer、narrow画面はbottom sheetへ統一する。

## UI refinement contract — 2026-07-29

### Goal

- User request: 整理後も微妙に見えるUIを、情報量を戻さず完成品らしい作戦盤へ仕上げる。
- Real problem being solved: 見出し、目標、地図、選択地点が別々の帯として並び、中央の広い枠に小さなノードが浮くため、簡素だが弱い画面に見える。
- Core mechanism affected: 発見した経路が一本につながり、次の一手を自分で選ぶ瞬間。

### Approach

- Chosen approach: `mission / route / action` を一枚のステージへ再構成し、地図ノードと経路を拡大する。補助情報は既存の一本のツールに残す。
- Rejected alternative 1: 画像heroや装飾カードを追加する。地図より装飾が主役になり、認知負荷を戻すため。
- Rejected alternative 2: 旧Mission Deckの三列・下段イベント構成へ戻す。情報は豊かでも、最初の判断が散るため。
- Why this is coherent: 新しい機能や状態を増やさず、既存の因果関係だけを視覚的に強くする。

### Change shape

- Add: 地図上の段階ラベル、選択地点とCTAを一体化する視覚構造、控えめな座標／紙面テクスチャ。
- Remove: 地図全体を囲う重い矩形、別帯として重複する見出し・目標・選択地点の境界、過剰な空白。
- Merge: 見出しと目標をmission headerへ、選択地点と主CTAをroute actionへ統合する。
- Rename: UI上の主要操作名は変更しない。
- Leave unchanged: データモデル、公開／ライブ状態、drawer、テーマ切替、focus管理、API、安全境界。

### Observable acceptance

- 1280×720の初見5秒で「準備経路を見て、選択地点から次の一手へ進む画面」と説明できる。
- 1280×720で地図ノード群が作業面の横幅の65%以上を使い、巨大な空の枠に見えない。
- 初期表示の強い面は地図ステージと主CTAだけで、補助カテゴリ名や本文を表示しない。
- 390×844でheader、mission、現在目標、選択地点、主CTA、地図の最初の2地点が初期画面に入る。
- PLAY、OPS、FOCUSは同じ情報順と操作を保ち、色を外しても選択中／発見済み／未発見を区別できる。
- 主要操作は44px以上、横スクロールなし、keyboard、Escape、focus return、reduced motionを維持する。
- 新規runtime依存、外部font、背景写真、偽データを追加しない。
