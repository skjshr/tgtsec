<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "home");
$vehicles = array_values(array_filter(
    kazekiri_vehicles(),
    static fn(array $vehicle): bool => $vehicle["featured"] === true
));
$articles = array_slice(array_values(kazekiri_articles()), 0, 3);

kazekiri_site_header(
    "風切モータース",
    "中古バイク選びから納車後の点検まで、同じ整備ピットで支える地域の二輪店です。",
    "home"
);
?>
<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <div class="site-width hero__grid">
      <div class="hero__copy">
        <p class="eyebrow">USED &amp; SERVICE</p>
        <h1 id="hero-title">
          <span>走り出す前も、</span>
          <span>走り続ける先も。</span>
        </h1>
        <p class="hero__lead">
          中古車選びから納車後の点検まで、同じ整備ピットで見届けます。
          入庫時の状態を記録し、必要な作業を済ませてから店頭へ並べています。
        </p>
        <div class="hero__actions">
          <a class="button button--primary" href="/inventory.php">在庫車両を見る</a>
          <a class="button button--secondary" href="/service.php">整備内容を確認する</a>
        </div>
      </div>
      <figure class="hero__media">
        <?= kazekiri_image(
            "workshop-hero.webp",
            "二台の中古バイクと工具が並ぶ風切モータースの整備ピット",
            1536,
            1024,
            "hero__photo",
            true
        ) ?>
      </figure>
    </div>
  </section>

  <section class="service-proof" aria-label="販売と整備の方針">
    <div class="site-width service-proof__grid">
      <div class="service-proof__item">
        <p class="service-proof__label">01 / CONDITION</p>
        <p class="service-proof__value">入庫時の状態と<br>気になる箇所を記録</p>
      </div>
      <div class="service-proof__item">
        <p class="service-proof__label">02 / BEFORE DELIVERY</p>
        <p class="service-proof__value">点検と試走を済ませ<br>作業内容を引渡し時に確認</p>
      </div>
      <div class="service-proof__item">
        <p class="service-proof__label">03 / AFTER SERVICE</p>
        <p class="service-proof__value">納車後の点検も<br>同じ整備窓口で受付</p>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="stock-title">
    <div class="site-width">
      <div class="section-heading">
        <h2 class="section-heading__title" id="stock-title">
          <span class="section-kicker">CURRENT STOCK</span>
          最近、整備を終えた車両
        </h2>
        <div class="section-heading__aside">
          <p>写真だけでは分からない傷や交換部品も、車両ごとの記録へ載せています。</p>
          <a class="text-link" href="/inventory.php">6台の在庫をすべて見る</a>
        </div>
      </div>
      <div class="featured-stock">
        <?php foreach ($vehicles as $index => $vehicle): ?>
          <article class="stock-card<?= $index === 0 ? " stock-card--lead" : "" ?>">
            <a class="stock-card__media" href="/vehicle.php?id=<?= h($vehicle["id"]) ?>">
              <?= kazekiri_image(
                  $vehicle["image"],
                  $vehicle["alt"],
                  1200,
                  900,
                  "stock-card__photo"
              ) ?>
            </a>
            <div class="stock-card__body">
              <div class="stock-card__meta">
                <span><?= h($vehicle["stock_number"]) ?></span>
                <span><?= h($vehicle["status"]) ?></span>
              </div>
              <h3><a href="/vehicle.php?id=<?= h($vehicle["id"]) ?>"><?= h($vehicle["name"]) ?> / <?= h($vehicle["color"]) ?></a></h3>
              <p class="stock-card__facts"><?= h($vehicle["year"]) ?>年 / <?= h($vehicle["distance"]) ?></p>
              <p class="stock-card__price">車両 <?= h($vehicle["price"]) ?>　支払総額目安 <?= h($vehicle["total"]) ?></p>
              <a class="text-link" href="/vehicle.php?id=<?= h($vehicle["id"]) ?>">状態と整備記録を見る</a>
            </div>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <section class="section section--surface" aria-labelledby="service-title">
    <div class="site-width service-feature">
      <div class="service-feature__media">
        <?= kazekiri_image(
            "inspection-brake.webp",
            "作業台でブレーキ部品の状態を確認している様子",
            1200,
            800,
            "service-feature__photo"
        ) ?>
      </div>
      <div class="service-feature__copy">
        <span class="section-kicker">WORKSHOP</span>
        <h2 id="service-title">納車前に、何を見たかまで渡します。</h2>
        <p>
          消耗品を替えた、だけでは終わらせません。残量、にじみ、始動時の様子、
          試走で気づいた点を記録し、次の点検時期と一緒に説明します。
        </p>
        <ol class="compact-steps">
          <li><span>01</span>入庫時の状態確認</li>
          <li><span>02</span>必要な整備と部品交換</li>
          <li><span>03</span>試走、増し締め、引渡し説明</li>
        </ol>
        <a class="button button--secondary" href="/service.php">整備の受付内容を見る</a>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="shop-title">
    <div class="site-width shop-preview">
      <div class="shop-preview__copy">
        <span class="section-kicker">SHOP</span>
        <h2 id="shop-title">風切川の近くで、販売と整備を同じ建物に。</h2>
        <p>
          展示場の奥が整備棟です。気になる車両があれば、リフトへ上げる前の状態や
          交換した部品を整備担当が説明します。
        </p>
        <dl class="shop-preview__hours">
          <div><dt>営業時間</dt><dd>10:00-18:00</dd></div>
          <div><dt>整備受付</dt><dd>17:00まで</dd></div>
          <div><dt>定休日</dt><dd>火曜・水曜</dd></div>
        </dl>
        <a class="text-link" href="/shop.php">来店方法と店内を見る</a>
      </div>
      <div class="shop-preview__media">
        <?= kazekiri_image(
            "shop-exterior-morning.webp",
            "朝の光が差す風切モータースの店舗外観",
            1600,
            900,
            "shop-preview__photo"
        ) ?>
      </div>
    </div>
  </section>

  <section class="section section--surface" aria-labelledby="news-title">
    <div class="site-width news-preview">
      <div class="section-heading section-heading--compact">
        <h2 class="section-heading__title" id="news-title">
          <span class="section-kicker">SHOP NOTE</span>
          店からのお知らせ
        </h2>
        <a class="text-link" href="/news.php">お知らせ一覧</a>
      </div>
      <div class="news-lines">
        <?php foreach ($articles as $article): ?>
          <article class="news-line">
            <time datetime="<?= h($article["date"]) ?>"><?= h(str_replace("-", ".", $article["date"])) ?></time>
            <h3><a href="/article.php?id=<?= h($article["id"]) ?>"><?= h($article["title"]) ?></a></h3>
            <p><?= h($article["summary"]) ?></p>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <section class="closing-cta" aria-labelledby="consult-title">
    <div class="site-width closing-cta__inner">
      <div>
        <p class="eyebrow">VISIT &amp; CONSULTATION</p>
        <h2 id="consult-title">現車確認の日を決める</h2>
        <p>見たい車両と来店予定を送ると、この画面で仮受付番号を発行します。</p>
      </div>
      <a class="button button--light" href="/contact.php">来店相談を始める</a>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
