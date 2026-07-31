<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "inventory");

$options = kazekiri_vehicle_filter_options();
$selected = [
    "category" => kazekiri_value($_GET, "category"),
    "use" => kazekiri_value($_GET, "use"),
    "availability" => kazekiri_value($_GET, "availability"),
];
$invalidFilters = [];
foreach ($selected as $name => $value) {
    if (!array_key_exists($value, $options[$name])) {
        $invalidFilters[] = $name;
    }
}

$vehicles = [];
if ($invalidFilters === []) {
    foreach (kazekiri_vehicles() as $vehicle) {
        $matches = true;
        foreach ($selected as $name => $value) {
            if ($value !== "" && $vehicle[$name] !== $value) {
                $matches = false;
                break;
            }
        }
        if ($matches) {
            $vehicles[] = $vehicle;
        }
    }
} else {
    http_response_code(400);
}

kazekiri_site_header(
    "在庫車両",
    "風切モータースが点検と整備を進めている中古バイクの一覧です。",
    "inventory"
);
?>
<main id="main">
  <header class="page-intro">
    <div class="site-width page-intro__grid">
      <div>
        <?php kazekiri_breadcrumb([["label" => "在庫車両"]]); ?>
        <p class="eyebrow">INVENTORY</p>
        <h1>現在の在庫車両</h1>
      </div>
      <p>
        写真、走行距離、整備記録を車両ごとに掲載しています。
        商談中や整備中の車両は、状態が変わり次第ここへ反映します。
      </p>
    </div>
  </header>

  <section class="section section--tight" aria-labelledby="filter-title">
    <div class="site-width">
      <form class="inventory-filter" method="get" action="/inventory.php">
        <div class="inventory-filter__heading">
          <h2 id="filter-title">条件を絞る</h2>
          <p>6台の中から、車種と使い方、商談状況で絞れます。</p>
        </div>
        <?php foreach ($options as $name => $values): ?>
          <label>
            <span><?= h([
                "category" => "車種",
                "use" => "主な使い方",
                "availability" => "商談状況",
            ][$name]) ?></span>
            <select name="<?= h($name) ?>">
              <?php foreach ($values as $value => $label): ?>
                <option value="<?= h($value) ?>"<?= $selected[$name] === $value ? " selected" : "" ?>><?= h($label) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
        <?php endforeach; ?>
        <div class="inventory-filter__actions">
          <button class="button button--primary" type="submit">この条件で見る</button>
          <a class="text-link" href="/inventory.php">条件を戻す</a>
        </div>
      </form>

      <?php if ($invalidFilters !== []): ?>
        <section class="inline-state inline-state--error" role="alert">
          <p class="eyebrow">FILTER ERROR</p>
          <h2>選べない条件が含まれています</h2>
          <p>在庫ページの選択肢から条件を選び直してください。</p>
          <a class="text-link" href="/inventory.php">すべての在庫を表示する</a>
        </section>
      <?php elseif ($vehicles === []): ?>
        <section class="inline-state" aria-live="polite">
          <p class="eyebrow">NO MATCH</p>
          <h2>この条件に合う車両はありません</h2>
          <p>商談状況を外すか、車種を指定せずにもう一度確認してください。</p>
          <a class="text-link" href="/inventory.php">条件を戻す</a>
        </section>
      <?php else: ?>
        <div class="result-summary" aria-live="polite">
          <p><strong><?= count($vehicles) ?>台</strong>を表示しています</p>
        </div>
        <div class="inventory-list">
          <?php foreach ($vehicles as $vehicle): ?>
            <article class="inventory-card">
              <a class="inventory-card__media" href="/vehicle.php?id=<?= h($vehicle["id"]) ?>">
                <?= kazekiri_image(
                    $vehicle["image"],
                    $vehicle["alt"],
                    1200,
                    900,
                    "inventory-card__photo"
                ) ?>
              </a>
              <div class="inventory-card__body">
                <div class="inventory-card__topline">
                  <span><?= h($vehicle["stock_number"]) ?></span>
                  <span class="status-chip status-chip--<?= h($vehicle["availability"]) ?>"><?= h($vehicle["status"]) ?></span>
                </div>
                <h2><a href="/vehicle.php?id=<?= h($vehicle["id"]) ?>"><?= h($vehicle["name"]) ?> / <?= h($vehicle["color"]) ?></a></h2>
                <dl class="vehicle-facts">
                  <div><dt>年式</dt><dd><?= h($vehicle["year"]) ?>年</dd></div>
                  <div><dt>走行距離</dt><dd><?= h($vehicle["distance"]) ?></dd></div>
                  <div><dt>車両価格</dt><dd><?= h($vehicle["price"]) ?></dd></div>
                  <div><dt>支払総額目安</dt><dd><?= h($vehicle["total"]) ?></dd></div>
                </dl>
                <p><?= h($vehicle["summary"]) ?></p>
                <a class="text-link" href="/vehicle.php?id=<?= h($vehicle["id"]) ?>">状態と整備記録を見る</a>
              </div>
            </article>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
