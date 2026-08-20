---
version: "2.3"
name: "ExamServer Open World — Calm Playable Map"
description: "A beginner cyber range that reveals complexity only after the learner asks for it."
colors:
  primary: "#007F90"
  primary-hover: "#006470"
  canvas: "#F1EEE5"
  surface: "#FFFDF5"
  surface-muted: "#E8E3D8"
  text: "#151410"
  text-muted: "#625F56"
  border: "#171611"
  success: "#087B6F"
  warning: "#E1A800"
  danger: "#DD3F3F"
typography:
  display:
    fontFamily: "Noto Sans JP"
    fontSize: "2rem"
    fontWeight: 850
    lineHeight: "1.25"
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Noto Sans JP"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.75"
    letterSpacing: "0px"
  label:
    fontFamily: "Noto Sans JP"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: "1.45"
    letterSpacing: "0px"
  mono:
    fontFamily: "Geist Mono"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: "1.4"
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "44px"
missionStage:
  breakpoint: "900px"
  typography:
    state: "0.4375rem"
    micro: "0.5rem"
    detail: "0.5625rem"
    action: "0.625rem"
    objective-mobile: "0.6875rem"
    compact: "0.75rem"
    objective-desktop: "0.8125rem"
    node-mobile: "0.875rem"
    node-desktop: "0.9375rem"
    display-desktop: "clamp(30px, 3.25vw, 46px)"
    display-tablet: "clamp(23px, 6.5vw, 30px)"
    display-mobile: "clamp(22px, 6.4vw, 27px)"
  geometry:
    control: "44px"
    action: "46px"
    node-desktop: "220px × 90px"
    unknown-desktop: "152px × 68px"
    node-mobile: "66px"
    selected-mobile: "78px"
    route-grid-play: "42px"
    route-grid-ops: "40px"
    route-grid-focus: "44px"
  palettes:
    play:
      routeInk: "#171611"
      selectedBackground: "#11110E"
      unknown: "#777166"
      possibleEdge: "#716C62"
    ops:
      nodeBorder: "#31545B"
      unknown: "#49636A"
      routeEdge: "#71DDC4"
      possibleEdge: "#879893"
    focus:
      unknown: "#817E75"
      routeEdge: "#4B4944"
  alphaLayers:
    texture: [0.022, 0.028, 0.03, 0.04, 0.05, 0.07, 0.08]
    shadow: [0.12, 0.18, 0.26, 0.28, 0.34, 0.35, 0.42]
---

# ExamServer Open World Design Contract

## Design thesis

このサイトは「説明を読む教材」ではなく、攻撃経路を自分で切り開くプレイアブルな作戦盤である。良い見た目の条件は装飾量ではない。2秒で現在地が分かり、10秒で次の仮説を比較でき、選んだ行動と発見の因果が記憶に残ることを品質基準とする。

認知負荷はユーザーが求めた時だけ上げる。初期画面には現在の状況、現在の目標、地図／仮説、次の主要操作だけを残す。補助情報への入口は、各画面に一本だけある「ツール」というラベル付きの引き手である。引いた後のdrawer内で初めて接続、事実、次の調査／ヒント、履歴の名称と件数を見せ、選んだ一種類だけ本文を表示する。

三つの見た目は配色プリセットではない。情報の意味、操作、状態を共有しながら、異なる構図・書体・境界・動きで同じ世界を演出する。

画面は人物を追跡しない。標的の確定進行、参加者が選んだguidance設定、開放済みhintを
canonical stateとし、同じcanonical stateは常に同じ地図、現在地、選択肢、説明を生成する。
時刻、event到着順、browser identity、themeは攻略位置を変えない。

安全と許可範囲は接続前とquiet help/legal surfaceに一度だけ置く。通常のmission、node、
説明、完了表示へ「演習」「トレーニング」を反復せず、調査世界への没入をノイズで壊さない。

### Mission stage refinement

簡素化後の初期画面を、見出し、目標、地図、選択地点が別々の帯に分かれた管理画面にしない。これらは一枚の `mission stage` として読み、上から `mission / objective / route / action` の一方向へ因果をつなぐ。

- mission: 画面種別と世界名を短く示す。長い説明文や独立したheroを置かない。
- objective: mission直下の一文として置き、カード化しない。
- route: 最大面積を渡し、ノード群が横幅の65%以上を使う。作業面全体を囲うだけの矩形を使わない。
- action: 選択地点と `次の一手` を一つの操作単位にする。地図と無関係な全幅footerに見せない。
- tools: 一本の引き手をmission stageの縁へ接続し、独立したボタンが空中に浮いたように見せない。

最初の10秒は「風切モータースの準備経路が見える → Debian標的が選択中だと分かる → 次の一手を押せる」の順に進む。説明を探す、凡例を読む、メニューを開く行為は含めない。

## Visual targets

- `docs/design/themes/play-mission-deck.png` — PLAY / Mission Deck
- `docs/design/themes/ops-night-circuit.png` — OPS / Night Circuit
- `docs/design/themes/focus-field-notes.png` — FOCUS / Field Notes
- 旧 `docs/design/exploration-map.png` と `docs/design/situation-consultation.png` は情報構造の参考であり、色・密度・雰囲気の正本ではない。

生成画像内のサンプル文言、数値、誤字、架空の機能は仕様ではない。実装は実データ、既存の安全境界、アクセシビリティを優先する。

## What “award-quality” means here

### 1. One memorable idea

主役は常に一本の攻撃経路である。地図、事実、次の選択、最近の発見が一つの因果へ収束し、KPIカードの寄せ集めにはしない。

### 2. Hierarchy before decoration

- 常時表示: 画面名、現在の目標、世界／仮説、次の主要操作
- 引き手: 各画面に補助情報をまとめた一本の `ツール`
- Header: ブランドと一本の `メニュー`。画面移動、見た目、演習終了、公開状態は開いた後に見せる
- 開いた時: 接続、事実、次の調査／ヒント、履歴から選択した一種類だけをdrawerへ表示する
- 緊急表示: 接続断や更新失敗だけは現在の作業を失わせず主画面へ通知する

見出し、選択地点、主ボタンだけが最強のコントラストを持つ。補助文、時刻、接続状態は一段静かにする。件数は「中に何があるか」を予告するために使い、進捗カードやKPI列にはしない。

### 3. Typography is the interface

- PLAY: `Noto Sans JP` の太い見出し。短く、勢いがあり、読み間違えない。
- OPS: `Noto Sans JP` と `Geist Mono`。日本語本文をコード風に崩さず、状態と時刻だけをmonoにする。
- FOCUS: `Noto Serif JP` の見出しと `Noto Sans JP` の本文。余白と行間で読む順を作る。
- 画像化された文字、極小文字、装飾だけの英語を主要情報に使わない。

### 4. Geometry carries state

発見済み、選択中、未発見は色だけで区別しない。実線／強調枠／破線、icon、label、focus ringを必ず併用する。未発見名や答えをDOMへ先出ししない。

### 5. Motion confirms cause

- 150–220ms、`cubic-bezier(0.16, 1, 0.3, 1)` を基本にする。
- hoverは2–3px以内の移動、選択はborderとshadowの変化、経路は控えめなdash移動まで。
- 常時点滅、無目的なparallax、スクロールジャック、Matrix rainを使わない。
- `prefers-reduced-motion` では即時表示にする。

### 6. Empty space is functional

余白は「未実装」を隠すためでなく、事実・地図・選択の境界を明確にするために使う。画面を同寸カードで埋めず、中央の経路へ最大の面積を渡す。

## Three authored modes

### PLAY / Mission Deck

ポップゲーム。黒いインク、温かい紙、electric cyan、acid yellow、coralで、クエスト盤の触感を作る。太い境界、ハードシャドウ、mission番号、選択地点の黒いbriefを使う。成人向けのグラフィックデザインであり、mascot、emoji、子供向けtoy表現、意味のない報酬演出は使わない。初回既定値はPLAY。

### OPS / Night Circuit

ハッカー風。midnight、phosphor mint、amber、ultravioletでライブ運用面を作る。細いgrid、mono metadata、発光を抑えたroute trace、角の小さいsurfaceを使う。green-code壁紙、Matrix rain、skull、過剰なneon、読みにくい全mono本文は使わない。

### FOCUS / Field Notes

シンプル。warm white、黒いink、signal vermilion、quiet cobaltで編集されたフィールドノートを作る。罫線、非対称の余白、明確な文字組みを使い、surface chromeを最小化する。単なるbeige SaaS、巨大な空白、情報を隠すミニマリズムにはしない。

## Shared interaction contract

- Headerの `メニュー` を開いた後にPLAY / OPS / FOCUSを即時切替できる。画面移動、三択、演習終了を初期表示しない。
- 選択は `aria-pressed` で伝え、44px相当の操作面と明確なfocus ringを持つ。
- 選択テーマはversion付きlocalStorageへ保存する。保存不能でもPLAYで継続する。
- テーマ切替で画面、地図選択、仮説、ヒント、セッション状態を初期化しない。
- 色テーマと公開ガイドはローカルbundleだけで動く。ライブ教材イベントは同一originのクラウドAPIから受け、外部fontや第三者UI SDKは要求しない。
- 補助情報のdrawerは同時に一枚だけ開く。`Escape` と背景操作で閉じ、閉じた後は元の引き手へfocusを戻す。
- drawer内へkeyboard focusを閉じ込め、見えていない補助情報をtab順へ残さない。
- 新しい教材イベントを受けてもdrawerを勝手に開かない。閉じている間は主画面の目標と進捗だけを更新し、件数はdrawerを開いた後に見せる。
- 個人プロフィール、ニックネーム、復旧コード、ランキング、管理画面を作らない。
- EASYを初期値とし、Header menu内でEASY / NORMAL / HARD / CUSTOMを変更できる。専用settings画面は増やさない。
- CUSTOMは次候補、道具、構文、実行例、不成功時の説明、技術説明量を個別に切り替える。途中変更で確定事実、選択、地図、hintを失わない。
- 未発見nodeは公開可能なカテゴリと名前のないシルエットだけを描き、隠れた名称、本文、commandをDOM、accessibility tree、bundle fixtureへ先出ししない。
- flagは任意の発見として静かに記録できるが、objective、route unlock、root完了を妨げない。

## State language

- Browse: 接続エラーにせず、世界観、遊び方、必要機材、安全境界と接続入口を表示する。
- Waiting: ペアリング済みだがBridge未到着。何を待っているかと再接続方法を示す。
- Loading: 最後の確定状態を残し、更新中と書く。
- Empty: 有線接続と入口確認だけを示す。
- Live: 新しい教材イベントで、地図の経路、現在目標、引き手の件数を更新する。開いているdrawerが該当する場合だけ中身も更新し、閉じている補助情報を勝手に展開しない。
- Reconnecting: 操作を失わせず、自動再接続と手動再読込を出す。
- Selected: border、icon、label、地点briefの4点で示す。
- Locked hint: 開放条件を日常語で示す。
- Success: rootまでの一本の経路と権限変化の振り返りを主役にする。
- Telemetry unavailable: 自動検出不能を明示し、有線接続、Bridge、再読込の確認手順だけを出す。flagは任意の収集物であり、手動提出や進行判定には使わない。
- No progress: 正誤判定やquizにせず、選択中の仮説について「まだ確定した変化がない」と示す。EASY/CUSTOMで許可された場合だけ観察を見直す説明を開く。

## Live transition contract

- 新しい事実では、まずイベント列へ追加し、続いて対応ノードと経路、最後に目標と選択肢を150-220msで更新する。
- ページ全体を再読込せず、現在の画面、選択地点、開いたヒント、テーマを維持する。
- 複数イベントを受けてもrevision順だけを採用し、古いsnapshotで画面を巻き戻さない。
- `prefers-reduced-motion`では同じ情報を即時更新し、色だけに頼らずラベルと形状も変える。
- BrowseからLiveへの切替は同じ世界へ接続したと理解できる連続した遷移にし、別アプリへ飛んだ印象を作らない。
- 同じevent集合を異なる到着順で受けてもworld順へ正規化し、同じcanonical stateと同じ表示を作る。

## Responsive contract

- 主基準: 1366×768。検証: 1672×941、1280×720、360×800。
- 900px未満でも初期画面へ補助情報を縦積みしない。一本の `ツール` だけを残し、選んだ情報をbottom sheetとして表示する。
- 狭いheaderもブランドと `メニュー` の一段だけにし、公開状態、画面移動、テーマ、演習終了は開いた後に表示する。
- モバイルでは地図を一本の縦経路として始め、選択地点と `次の一手` を同じ行へ統合する。初期画面内に先頭二地点と選択地点を入れ、残りの経路だけを作業面内でスクロールさせる。
- 横スクロール、sticky headerによるfocus隠れ、44px未満の主要操作を許さない。

## Rejected directions

- generic dashboard、KPI、ranking、streak、trophy、card soup
- 事実、行動、履歴、接続、設定をすべて常時表示するcontrol-room layout
- glassmorphism、巨大な角丸container、無意味なgradient
- 見出し、目標、地図、選択地点をそれぞれ独立した帯やcardへ分割すること
- 巨大な矩形の中央へ小さなgraphをfitさせ、空白を作業面に見せること
- mission/mapのcomponent規則へ色やfont-sizeを直書きすること。`missionStage` のsemantic token宣言を唯一の入口にする
- fake terminal、code rain、stock hacker photography
- chat人格、自由文AI prompt、仮説より先に完全commandを見せること
- account/profile、復旧コード、leaderboard、admin dashboard、理解確認quiz
- runtimeで生成画像を背景として読み込み、offline bundleを重くすること

## `/bukai` reference style

- デジタル庁デザインシステムに沿い、フォントは`Noto Sans JP`を第一候補、コードは`Noto Sans Mono`を第一候補としてsystem fallbackを持つ。外部Web fontは読まない。
- 本文は16px以上、行高1.7、codeは1.5。日本語italic、過度な英大文字、ハッカー風mono本文を使わない。
- ライトテーマに固定し、白、中性gray、深いblueの一系統で情報階層を作る。本文と背景は4.5:1以上、focusや非テキスト境界は3:1以上を確保する。
- desktopは左のページ内目次と本文、mobileは目次を本文上に移す。単一主題の弱点だけを境界でまとめ、同寸カード網羅にしない。
- 長い手順は`details`に収め、summaryは「詳細を見る」ではなく「Web診断で入力境界を確認する」のように内容を説明する。
- 動きはhover、focus、copy成功のフィードバックだけ。装飾動画、glow、gradient text、fake terminal、Matrix表現を使わない。
