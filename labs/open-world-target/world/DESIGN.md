---
version: "1.0"
name: "Kazekiri Motors — Local Workshop"
description: "A believable regional motorcycle dealership with a restrained internal service console."
colors:
  ink: "#142125"
  paper: "#F3F1EA"
  surface: "#FCFBF7"
  brand: "#A63D2F"
  brand-dark: "#7D2D24"
  steel: "#39545C"
  line: "#D8D4C9"
  muted: "#4A5A5F"
  staff-navy: "#12262D"
  staff-mint: "#9ECDBF"
typography:
  display: "system Japanese sans-serif, 700, compact tracking"
  body: "system Japanese sans-serif, 400, 1.75 line-height"
  metadata: "system monospace, 600"
geometry:
  content: "min(1180px, viewport minus 40px)"
  control: "44px minimum"
  radius: "2px / 6px / 12px"
  publicGrid: "12 columns"
  staffGrid: "minmax(0, 1fr) + 18rem rail"
---

# Kazekiri Target Web Design Contract

## Design thesis

標的サイトのリアリティは、ハッカー風の装飾ではなく、普通の業務が積み重なって
見えることで作る。公開ページは、地方都市で長く営業する中古バイク販売・整備店の
静かな信頼感を持つ。スタッフ画面は、その裏側にある少し古く実務的な社内ツールと
して見せる。二つの面に同じロゴ、色、語彙を使い、入口を「脆弱性のボタン」ではなく
業務導線の一つとして自然に置く。

画像は雰囲気を飾る背景ではなく、整備リフト、工具、車両、朝の光によって業態を
一目で証明する一次情報として使う。可読性のための暗いgradientや文字焼き込みは
避け、コピーと画像を独立したグリッドへ置く。

攻略サイトの語彙、地図、theme、mission装飾は一切共有しない。安全上必要な架空表記は
全page共通footerの最下部へ一度だけ置き、utility、hero、画像、業務本文、staff consoleで
「演習」「training」を反復しない。

## One memorable idea

「走り出す前も、走り続ける先も。」という一文と、朝の整備場を主役にする。
販売と整備が一続きの仕事であることを、ページ全体の情報順にも反映する。

## Public site hierarchy

1. Slim utility bar: 営業時間、整備受付状況、スタッフ入口
2. Brand header: wordmark and real page navigation
3. Home hero: promise, proof, inventory/service actions, workshop image
4. Inventory: six allowlisted vehicles with filter, detail, condition, history
5. Service: inspection/oil/tire/workshop workflows and practical FAQ
6. Shop: exterior, showroom, waiting counter, fictional access and hours
7. News: believable seasonal maintenance and arrival articles
8. Contact: local validation, no persistence, clear completion state
9. Footer: navigation, operating note, one quiet fictional-site disclosure

Hero以外を同じ大きさのカードで埋めない。在庫写真は実車情報の一次資料として使い、
type、排気量帯、用途、価格、入庫状況、整備記録を編集された一覧と詳細で見せる。

## Staff page hierarchy

1. Dark staff masthead with environment and branch metadata
2. Breadcrumb and page title
3. Main diagnostic form with one primary action
4. Result console that appears only after submission
5. Quiet side rail for status, usage note, verification code
6. Footer with training-only disclosure and public-site return

スタッフ面はネオン、Matrix表現、常時点滅、偽コード雨を使わない。濃紺のmasthead、
薄い罫線、mono metadata、乾いたstatus表示で、実在する保守画面の質感を作る。

## Visual grammar

- Public surfaces use warm paper, ink, rust red, and blue-grey
- Staff surfaces use navy, off-white, restrained mint, and amber only for notes
- Dividers and alignment do more work than shadows
- Corners stay mostly square; large pill containers are prohibited
- The wordmark is code-native text and a simple abstract road/wind mark
- Generated imagery contains no readable text, logos, people posing, or plates
- No gradients except a subtle image fallback or output-console depth cue

## Typography

No external font request is allowed. Japanese copy uses the platform sans stack:
`"BIZ UDPGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif`.
Technical metadata uses `ui-monospace, "Cascadia Code", monospace`.
Headings are short, left aligned, and avoid decorative English above every block.

## Interaction

- Same-page navigation uses ordinary anchors and preserves browser behavior
- All controls provide a visible `:focus-visible` ring
- Form labels remain persistent; placeholders are examples only
- The public staff link is visible but visually subordinate
- Reduced motion removes scroll behavior and hover translation
- No JavaScript is required for essential reading or the diagnostic flow

## Responsive contract

- 900px and wider: split hero and staff main/rail layouts
- Below 900px: one-column reading order, no overlapping surfaces
- 375×844: utility content wraps, navigation scrolls only if necessary, the
  primary hero statement and image remain visible without clipped text
- Minimum target size is 44px and page width never exceeds the viewport
- POST後のcontact receiptとdiagnostic resultはviewport内へ着地し、結果を探す長いscrollを要求しない

## Rejected directions

- generic SaaS dashboard, KPI card grid, glassmorphism, oversized pill UI
- cyberpunk neon, skull imagery, Matrix rain, fake terminal wallpaper
- luxury superbike showroom, western roadside dealership, racing sponsor collage
- stock-photo people pointing at vehicles
- fake customer reviews, fake prices, fake phone numbers, or a real address
- making the training disclosure the hero message
- visible controls without a working destination, duplicate exercise notices,
  image overlays that say training, and single-page anchors pretending to be a full site

## Review lanes

- Information architecture: business story and staff utility have a clear order
- Hierarchy: hero and diagnostic action dominate without hiding safety context
- Grammar: typography, dividers, color, and imagery share one regional-workshop voice
- Anti-patterns: no card soup, fake metrics, hacker cliché, or external dependency
- Token consistency: all pages use the declared color, type, spacing, and control rules
- Coherence: public and staff views feel owned by the same fictional company
- Experience: beginner can find the staff path and operate it on desktop or mobile
