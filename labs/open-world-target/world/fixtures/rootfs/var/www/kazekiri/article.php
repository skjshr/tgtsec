<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "news");
$id = kazekiri_value($_GET, "id");
$articles = kazekiri_articles();
if ($id === "" || !isset($articles[$id])) {
    kazekiri_not_found(
        "news",
        "お知らせが見つかりません",
        "指定された記事は掲載を終了したか、URLが変わった可能性があります。",
        "/news.php",
        "お知らせ一覧へ戻る"
    );
}
$article = $articles[$id];

kazekiri_site_header(
    $article["title"],
    $article["summary"],
    "news"
);
?>
<main id="main">
  <article class="article-detail">
    <div class="site-width article-detail__header">
      <?php kazekiri_breadcrumb([
          ["label" => "お知らせ", "href" => "/news.php"],
          ["label" => $article["title"]],
      ]); ?>
      <time datetime="<?= h($article["date"]) ?>"><?= h(str_replace("-", ".", $article["date"])) ?></time>
      <h1><?= h($article["title"]) ?></h1>
      <p><?= h($article["summary"]) ?></p>
    </div>
    <div class="site-width article-detail__media">
      <?= kazekiri_image(
          $article["image"],
          $article["alt"],
          $article["image"] === "area-mountain-road.webp" ? 1600 : 1200,
          $article["image"] === "area-mountain-road.webp" ? 686 : 800,
          "article-detail__photo",
          true
      ) ?>
    </div>
    <div class="site-width article-detail__body">
      <?php foreach ($article["body"] as $paragraph): ?>
        <p><?= h($paragraph) ?></p>
      <?php endforeach; ?>
      <aside>
        <h2>来店前の確認</h2>
        <p>整備の預かりや在庫車両の確認は、来店相談から希望日を送れます。</p>
        <a class="text-link" href="/contact.php">来店相談へ</a>
      </aside>
      <a class="text-link" href="/news.php">お知らせ一覧へ戻る</a>
    </div>
  </article>
</main>
<?php kazekiri_site_footer(); ?>
