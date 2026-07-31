<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "news");
$articles = array_values(kazekiri_articles());

kazekiri_site_header(
    "お知らせ",
    "入庫車両、季節の点検、店舗の受付について風切モータースからお知らせします。",
    "news"
);
?>
<main id="main">
  <header class="page-intro">
    <div class="site-width page-intro__grid">
      <div>
        <?php kazekiri_breadcrumb([["label" => "お知らせ"]]); ?>
        <p class="eyebrow">SHOP NOTE</p>
        <h1>店からのお知らせ</h1>
      </div>
      <p>入庫作業と季節の点検、車両預かりについて、整備棟から必要なことだけお知らせします。</p>
    </div>
  </header>

  <section class="section section--tight">
    <div class="site-width article-index">
      <?php foreach ($articles as $index => $article): ?>
        <article class="article-card<?= $index === 0 ? " article-card--lead" : "" ?>">
          <a class="article-card__media" href="/article.php?id=<?= h($article["id"]) ?>">
            <?= kazekiri_image(
                $article["image"],
                $article["alt"],
                $article["image"] === "area-mountain-road.webp" ? 1600 : 1200,
                $article["image"] === "area-mountain-road.webp" ? 686 : 800,
                "article-card__photo"
            ) ?>
          </a>
          <div class="article-card__body">
            <time datetime="<?= h($article["date"]) ?>"><?= h(str_replace("-", ".", $article["date"])) ?></time>
            <h2><a href="/article.php?id=<?= h($article["id"]) ?>"><?= h($article["title"]) ?></a></h2>
            <p><?= h($article["summary"]) ?></p>
            <a class="text-link" href="/article.php?id=<?= h($article["id"]) ?>">続きを読む</a>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
