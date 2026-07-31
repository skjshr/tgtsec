<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "service");
$services = kazekiri_services();

kazekiri_site_header(
    "整備・点検",
    "定期点検、油脂類、タイヤ、預かり整備の受付内容と作業の流れをご案内します。",
    "service"
);
?>
<main id="main">
  <header class="page-intro page-intro--with-media">
    <div class="site-width page-intro__media-grid">
      <div class="page-intro__copy">
        <?php kazekiri_breadcrumb([["label" => "整備・点検"]]); ?>
        <p class="eyebrow">SERVICE &amp; WORKSHOP</p>
        <h1>次に困るところまで、点検で見ておく。</h1>
        <p>
          故障した箇所だけを直すと、別の消耗品がすぐ交換時期になることがあります。
          普段の距離と保管場所を聞き、今やる作業と次回でよい作業を分けて説明します。
        </p>
        <a class="button button--primary" href="/contact.php?topic=service">整備の来店相談</a>
      </div>
      <div class="page-intro__media">
        <?= kazekiri_image(
            "inspection-brake.webp",
            "ブレーキ部品の残量と摩耗を作業台で確認する様子",
            1200,
            800,
            "page-intro__photo",
            true
        ) ?>
      </div>
    </div>
  </header>

  <section class="section" aria-labelledby="menu-title">
    <div class="site-width">
      <div class="section-heading">
        <h2 class="section-heading__title" id="menu-title">
          <span class="section-kicker">SERVICE MENU</span>
          受付している作業
        </h2>
        <p class="section-heading__copy">
          作業時間は車種と状態で変わります。入庫後に追加作業が必要になった場合は、
          手を付ける前に内容を確認します。
        </p>
      </div>
      <div class="service-ledger">
        <?php foreach ($services as $index => $service): ?>
          <article class="service-entry" id="<?= h($service["id"]) ?>">
            <div class="service-entry__media">
              <?= kazekiri_image(
                  $service["image"],
                  $service["alt"],
                  1200,
                  $service["image"] === "service-oil-bench.webp" || $service["image"] === "service-tire-lift.webp" ? 900 : 800,
                  "service-entry__photo"
              ) ?>
            </div>
            <div class="service-entry__body">
              <p class="service-entry__number"><?= str_pad((string)($index + 1), 2, "0", STR_PAD_LEFT) ?></p>
              <h3><?= h($service["title"]) ?></h3>
              <p><?= h($service["lead"]) ?></p>
              <ul>
                <?php foreach ($service["items"] as $item): ?>
                  <li><?= h($item) ?></li>
                <?php endforeach; ?>
              </ul>
              <p class="service-entry__time"><span>預かり目安</span><?= h($service["time"]) ?></p>
            </div>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <section class="section section--surface" aria-labelledby="flow-title">
    <div class="site-width workshop-flow">
      <div>
        <span class="section-kicker">WORK FLOW</span>
        <h2 id="flow-title">受付から返却まで</h2>
        <p>症状が再現しない時は、推測だけで部品を替えず、確認できた範囲を記録します。</p>
      </div>
      <ol>
        <li>
          <span>01</span>
          <div><h3>受付</h3><p>いつ、どの速度や天候で症状が出たかを聞きます。</p></div>
        </li>
        <li>
          <span>02</span>
          <div><h3>確認</h3><p>見積り前に、漏れ、摩耗、始動、灯火の状態を確認します。</p></div>
        </li>
        <li>
          <span>03</span>
          <div><h3>作業</h3><p>追加作業は先に連絡し、交換した部品を分けて保管します。</p></div>
        </li>
        <li>
          <span>04</span>
          <div><h3>返却</h3><p>行った作業と、次に見る時期を整備記録へ残します。</p></div>
        </li>
      </ol>
    </div>
  </section>

  <section class="section" aria-labelledby="service-help-title">
    <div class="site-width service-help">
      <div>
        <span class="section-kicker">BEFORE YOU VISIT</span>
        <h2 id="service-help-title">持ち込み部品や当日返却について</h2>
      </div>
      <p>
        適合が確認できない部品、安全に関わる中古部品は取り付けできません。
        当日返却を希望する場合は、来店前に作業内容を知らせてください。
      </p>
      <div class="service-help__links">
        <a class="text-link" href="/faq.php">整備のよくある質問</a>
        <a class="button button--secondary" href="/contact.php?topic=service">整備の来店相談</a>
      </div>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
