# Task Contract: Kazekiri Target Web Realism

## Goal

Debian標的のApache/PHPサイトを、架空の地方バイク販売・整備店
「風切モータース」の実在感ある複数ページの業務サイトと社内診断画面へ仕上げる。
入口の発見、POSTフォーム、意図的なcommand injection、固定イベント、
entry flag表示はそのまま維持する。

## Frame

- Primary audience: 直結したKaliから初めて標的を調べるセキュリティ初心者
- Primary moment: `http://10.13.37.10/`を開き、普通の業務サイトから
  スタッフ向け接続診断を見つける瞬間
- Runtime: Debian 13、Apache、PHP。外部インターネット接続なし
- Identity: 実在企業ではない地域密着型の中古バイク販売・整備店
- Safety: 最下部のquiet legal noteだけで架空サイトと示し、実在ロゴ、識別可能な人物、
  店舗住所、電話番号、登録番号、読めるナンバープレートを使わない

## Fixed exercise contract

- Public entry remains `/`
- Staff entry remains `/staff/diagnostics.php`
- Home links to `/staff/diagnostics.php`
- Diagnostics keeps `<form method="post">` and the `target` field name
- Diagnostics keeps the intentional `/bin/ping -c 1 ` command concatenation
- Diagnostics keeps HTML-escaped input and result output
- Entry flag remains `/var/lib/open-world/flags/entry-web.flag`
- Telemetry receives fixed event tuples only and never the raw target
- Existing `entry.discovered` and `foothold.acquired` tuples remain unchanged

## Change shape

- Add: shared PHP data/partials、在庫一覧/詳細、整備、店舗、記事、FAQ、問い合わせ、
  staff導線、写真調local WebP asset、実動する検索/絞り込み/POST状態
- Remove: 反復する演習表記、画像内training表示、動かないnavigation、
  同一page anchorだけでサイト全体に見せる構造
- Merge: 共通brand/header/footer、在庫/記事data、form validationをsingle ownersへ統合
- Leave unchanged: PHP event logic, vulnerable command boundary, Apache address,
  telemetry, world graph, flags, credentials, network isolation

## Public route contract

- `/` — brand promise、featured stock、service入口、最新記事、店舗入口
- `/inventory.php` — GET queryで動くcategory/use/availability filter
- `/vehicle.php?id=...` — allowlist済み6台の詳細、状態、整備記録、関連車両
- `/service.php` — 点検、油脂、タイヤ、車検相当の作業説明とFAQ入口
- `/shop.php` — 架空地域、営業時間、来店方法、展示場/待合/工場
- `/news.php`、`/article.php?id=...` — allowlist済み記事一覧と詳細
- `/faq.php` — 在庫、整備、持込、来店に関する実用回答
- `/contact.php` — local validationと受付番号を返すPOST。入力本文を保存・送信しない
- `/staff/diagnostics.php` — discoverable staff utility and fixed vulnerable boundary

存在しないID、filter、methodはhonest empty/404/405 stateを返す。見えるlink、button、formは
すべて上記routeの実動作へ接続し、外部requestを発生させない。

## Image contract

- `workshop-hero.webp`
- `shop-exterior-morning.webp`
- `stock-01.webp` through `stock-06.webp`
- `inspection-brake.webp`
- `service-oil-bench.webp`
- `service-tire-lift.webp`
- `parts-shelf.webp`
- `showroom-floor.webp`
- `waiting-counter.webp`
- `workshop-rain.webp`
- `area-mountain-road.webp`

写真は同じ山と川の近い地方都市、同じ小規模店舗として光、素材、季節感を揃える。
実在brand、読める文字/plate、watermark、特定可能な人物を入れない。HTMLで寸法を宣言し、
意味のあるaltを持ち、すべてlocal WebPとしてbundle hash対象にする。

## Observable acceptance

- At 1280×720 the home page reads within five seconds as a credible Japanese
  motorcycle sales and service business, not a cyber-range landing page
- The staff page reads as an internal operations utility, not a decorative
  hacker terminal
- Every public route above has a specific title, working navigation, honest
  empty/error state, and no decorative dead control
- Inventory filtering, detail lookup, contact validation/receipt, and diagnostic
  POST run without JavaScript or external service
- The target ships all contracted photoreal WebP assets and makes no external
  image, font, script, form, analytics, or network request
- Training wording appears only once in the quiet legal footer and never in
  image text, utility bar, hero, store copy, or staff working content
- At 375×844 both pages have no horizontal overflow and retain 44px controls
- The staff link remains discoverable through plausible utility navigation
- All images, styles, and fonts are local; the pages make no external requests
- Keyboard focus, skip navigation, contrast, reduced motion, and semantic
  landmarks remain usable
- Static fixture, bundle, and telemetry tests pass
- Real browser screenshots are reviewed at 1280×720 and 375×844

## Non-goals

- Do not add ecommerce/payment, customer accounts, persistent inquiry storage,
  analytics, JavaScript frameworks, external fonts, or third-party assets
- Do not make the intentional vulnerability safer or harder to exercise
- Do not claim physical Debian deployment until the target bundle is rebuilt,
  installed, and verified on the notebook
