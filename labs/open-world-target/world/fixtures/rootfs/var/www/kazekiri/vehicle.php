<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "inventory");
$id = kazekiri_value($_GET, "id");
$vehicles = kazekiri_vehicles();
if ($id === "" || !isset($vehicles[$id])) {
    kazekiri_not_found(
        "inventory",
        "車両が見つかりません",
        "在庫番号が変わったか、掲載を終了した可能性があります。",
        "/inventory.php",
        "在庫一覧へ戻る"
    );
}
$vehicle = $vehicles[$id];
$related = [];
foreach ($vehicles as $candidate) {
    if ($candidate["id"] === $vehicle["id"]) {
        continue;
    }
    if ($candidate["category"] === $vehicle["category"] || count($related) === 0) {
        $related[] = $candidate;
    }
    if (count($related) === 2) {
        break;
    }
}

kazekiri_site_header(
    $vehicle["name"],
    $vehicle["summary"],
    "inventory"
);
?>
<main id="main">
  <div class="site-width detail-breadcrumb">
    <?php kazekiri_breadcrumb([
        ["label" => "在庫車両", "href" => "/inventory.php"],
        ["label" => $vehicle["stock_number"]],
    ]); ?>
  </div>

  <article class="vehicle-detail">
    <div class="site-width vehicle-detail__hero">
      <div class="vehicle-detail__media">
        <?= kazekiri_image(
            $vehicle["image"],
            $vehicle["alt"],
            1200,
            900,
            "vehicle-detail__photo",
            true
        ) ?>
      </div>
      <div class="vehicle-detail__summary">
        <div class="vehicle-detail__topline">
          <span><?= h($vehicle["stock_number"]) ?></span>
          <span class="status-chip status-chip--<?= h($vehicle["availability"]) ?>"><?= h($vehicle["status"]) ?></span>
        </div>
        <h1><?= h($vehicle["name"]) ?><small><?= h($vehicle["color"]) ?></small></h1>
        <p class="vehicle-detail__lead"><?= h($vehicle["summary"]) ?></p>
        <dl class="vehicle-specs">
          <div><dt>年式</dt><dd><?= h($vehicle["year"]) ?>年</dd></div>
          <div><dt>走行距離</dt><dd><?= h($vehicle["distance"]) ?></dd></div>
          <div><dt>車両価格</dt><dd><?= h($vehicle["price"]) ?></dd></div>
          <div><dt>支払総額目安</dt><dd><?= h($vehicle["total"]) ?></dd></div>
        </dl>
        <p class="price-note">支払総額は店頭受取を前提にした目安です。登録地域や保険の選択で変わります。</p>
        <?php if ($vehicle["availability"] === "service"): ?>
          <div class="availability-note">
            整備完了前のため、現車確認のみ受け付けています。作業予定は来店相談で確認できます。
          </div>
        <?php endif; ?>
        <a class="button button--primary button--wide" href="/contact.php?vehicle=<?= h($vehicle["id"]) ?>">この車両の来店相談</a>
      </div>
    </div>

    <div class="site-width vehicle-detail__content">
      <section aria-labelledby="condition-title">
        <div class="content-heading">
          <span class="section-kicker">CONDITION</span>
          <h2 id="condition-title">入庫時の状態</h2>
        </div>
        <dl class="condition-list">
          <?php foreach ($vehicle["condition"] as $label => $description): ?>
            <div>
              <dt><?= h($label) ?></dt>
              <dd><?= h($description) ?></dd>
            </div>
          <?php endforeach; ?>
        </dl>
      </section>

      <section aria-labelledby="history-title">
        <div class="content-heading">
          <span class="section-kicker">WORK LOG</span>
          <h2 id="history-title">整備記録</h2>
        </div>
        <ol class="work-log">
          <?php foreach ($vehicle["history"] as $entry): ?>
            <li>
              <time datetime="<?= h(str_replace(".", "-", $entry["date"])) ?>"><?= h($entry["date"]) ?></time>
              <span><?= h($entry["work"]) ?></span>
            </li>
          <?php endforeach; ?>
        </ol>
      </section>

      <aside class="delivery-note" aria-labelledby="delivery-title">
        <h2 id="delivery-title">引渡しまでに確認すること</h2>
        <ul>
          <?php foreach ($vehicle["notes"] as $note): ?>
            <li><?= h($note) ?></li>
          <?php endforeach; ?>
        </ul>
        <p>商談成立後にもう一度試走し、漏れ、空気圧、灯火、締結部を確認します。</p>
        <a class="text-link" href="/service.php">納車前の整備内容を見る</a>
      </aside>
    </div>
  </article>

  <section class="section section--surface" aria-labelledby="related-title">
    <div class="site-width">
      <div class="section-heading section-heading--compact">
        <h2 class="section-heading__title" id="related-title">ほかの在庫</h2>
        <a class="text-link" href="/inventory.php">在庫一覧へ</a>
      </div>
      <div class="related-stock">
        <?php foreach ($related as $candidate): ?>
          <article>
            <a href="/vehicle.php?id=<?= h($candidate["id"]) ?>">
              <?= kazekiri_image(
                  $candidate["image"],
                  $candidate["alt"],
                  1200,
                  900,
                  "related-stock__photo"
              ) ?>
              <span><?= h($candidate["name"]) ?> / <?= h($candidate["color"]) ?></span>
            </a>
            <p><?= h($candidate["year"]) ?>年 / <?= h($candidate["distance"]) ?> / <?= h($candidate["status"]) ?></p>
          </article>
        <?php endforeach; ?>
      </div>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
