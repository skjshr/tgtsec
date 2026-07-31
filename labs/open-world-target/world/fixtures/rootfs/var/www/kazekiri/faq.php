<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET"], "faq");
$groups = kazekiri_faq_groups();

kazekiri_site_header(
    "よくある質問",
    "在庫車両、整備、持ち込み部品、来店についてよくある質問にお答えします。",
    "faq"
);
?>
<main id="main">
  <header class="page-intro">
    <div class="site-width page-intro__grid">
      <div>
        <?php kazekiri_breadcrumb([["label" => "よくある質問"]]); ?>
        <p class="eyebrow">FAQ</p>
        <h1>よくある質問</h1>
      </div>
      <p>在庫の確認、整備の預かり、来店前に聞かれることをまとめました。</p>
    </div>
  </header>

  <section class="section section--tight">
    <div class="site-width faq-layout">
      <aside class="faq-index" aria-label="質問カテゴリ">
        <p>質問カテゴリ</p>
        <?php foreach ($groups as $group => $_questions): ?>
          <a href="#<?= h("faq-" . sha1($group)) ?>"><?= h($group) ?></a>
        <?php endforeach; ?>
      </aside>
      <div class="faq-groups">
        <?php foreach ($groups as $group => $questions): ?>
          <section class="faq-group" id="<?= h("faq-" . sha1($group)) ?>">
            <h2><?= h($group) ?></h2>
            <dl>
              <?php foreach ($questions as $question): ?>
                <div>
                  <dt><?= h($question["q"]) ?></dt>
                  <dd><?= h($question["a"]) ?></dd>
                </div>
              <?php endforeach; ?>
            </dl>
          </section>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <section class="closing-cta" aria-labelledby="faq-contact-title">
    <div class="site-width closing-cta__inner">
      <div>
        <p class="eyebrow">STILL UNSURE</p>
        <h2 id="faq-contact-title">車両を見ながら相談できます</h2>
        <p>在庫番号か整備内容を選び、来店予定を送ってください。</p>
      </div>
      <a class="button button--light" href="/contact.php">来店相談へ</a>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
