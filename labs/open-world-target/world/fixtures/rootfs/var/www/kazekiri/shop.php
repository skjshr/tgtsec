<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "shop");

kazekiri_site_header(
    "店舗案内",
    "風切川沿いの展示場、待合、整備棟と、来店時の入口をご案内します。",
    "shop"
);
?>
<main id="main">
  <header class="shop-hero">
    <div class="site-width">
      <?php kazekiri_breadcrumb([["label" => "店舗案内"]]); ?>
      <div class="shop-hero__copy">
        <p class="eyebrow">SHOP</p>
        <h1>展示場の奥に、<br>いつもの整備ピット。</h1>
        <p>
          風切川沿いの県道から一本入った場所にあります。
          展示車両の確認は予約不要。整備相談は担当を空けるため、来店日を先に知らせてください。
        </p>
      </div>
      <div class="shop-hero__media">
        <?= kazekiri_image(
            "shop-exterior-morning.webp",
            "山あいの朝に開店準備をする風切モータースの店舗外観",
            1600,
            900,
            "shop-hero__photo",
            true
        ) ?>
      </div>
    </div>
  </header>

  <section class="section" aria-labelledby="spaces-title">
    <div class="site-width">
      <div class="section-heading">
        <h2 class="section-heading__title" id="spaces-title">
          <span class="section-kicker">INSIDE THE SHOP</span>
          店内と整備棟
        </h2>
        <p class="section-heading__copy">展示場、受付、整備棟は同じ建物です。車両を預ける時は東側の搬入口へ回ってください。</p>
      </div>
      <div class="space-stories">
        <article class="space-story space-story--wide">
          <?= kazekiri_image(
              "showroom-floor.webp",
              "中古バイクを間隔を空けて並べた風切モータースの展示場",
              1200,
              800,
              "space-story__photo"
          ) ?>
          <div><span>01</span><h3>展示場</h3><p>在庫車両と整備記録を一緒に確認します。商談中の車両には受付票を付けています。</p></div>
        </article>
        <article class="space-story">
          <?= kazekiri_image(
              "waiting-counter.webp",
              "木のカウンターと椅子を置いた小さな受付と待合",
              1200,
              800,
              "space-story__photo"
          ) ?>
          <div><span>02</span><h3>受付と待合</h3><p>整備の受付票を記入し、症状が出た時の状況を担当へ伝えます。</p></div>
        </article>
        <article class="space-story">
          <?= kazekiri_image(
              "parts-shelf.webp",
              "交換部品と消耗品を分類して置いた整備工場の棚",
              1200,
              800,
              "space-story__photo"
          ) ?>
          <div><span>03</span><h3>部品保管</h3><p>車両ごとに棚を分け、交換前の部品は返却説明まで保管します。</p></div>
        </article>
      </div>
    </div>
  </section>

  <section class="section section--surface" aria-labelledby="visit-title">
    <div class="site-width visit-grid">
      <div class="visit-grid__media">
        <?= kazekiri_image(
            "area-mountain-road.webp",
            "山と川の間を通る風切地区の舗装路",
            1600,
            686,
            "visit-grid__photo"
        ) ?>
      </div>
      <div class="visit-grid__copy">
        <span class="section-kicker">VISIT</span>
        <h2 id="visit-title">来店時の入口</h2>
        <dl class="shop-details">
          <div><dt>二輪で来店</dt><dd>正面の展示場前へ。砂利側には停めないでください。</dd></div>
          <div><dt>車で来店</dt><dd>西側に2台分あります。満車時は受付へ声をかけてください。</dd></div>
          <div><dt>整備車両の搬入</dt><dd>東側の屋根付き搬入口で受け付けます。</dd></div>
          <div><dt>公共交通</dt><dd>風切中央駅から川沿いを徒歩18分です。</dd></div>
        </dl>
        <p class="quiet-note">道順が分かりにくい場合は、来店相談で車種と到着予定を知らせてください。</p>
      </div>
    </div>
  </section>

  <section class="section" aria-labelledby="hours-title">
    <div class="site-width hours-section">
      <div>
        <span class="section-kicker">OPENING HOURS</span>
        <h2 id="hours-title">営業時間</h2>
        <p>部品の受け取りだけの場合も、閉店30分前までに来店してください。</p>
      </div>
      <dl>
        <div><dt>月・木・金</dt><dd>10:00-18:00</dd></div>
        <div><dt>土・日</dt><dd>10:00-18:00</dd></div>
        <div><dt>火・水</dt><dd>定休日</dd></div>
        <div><dt>整備受付</dt><dd>17:00まで</dd></div>
      </dl>
      <a class="button button--primary" href="/contact.php?topic=visit">来店日を相談する</a>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
