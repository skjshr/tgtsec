<?php

declare(strict_types=1);

require __DIR__ . '/inc/site.php';

$notice = read_site_notice();
?>
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="喫茶みちくさの公式サイト">
  <title>喫茶みちくさ</title>
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/" aria-label="喫茶みちくさ ホーム">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img">
          <path d="M14 23h34v18a13 13 0 0 1-13 13h-8a13 13 0 0 1-13-13V23Z"/>
          <path d="M48 28h4a8 8 0 0 1 0 16h-5"/>
          <path d="M22 15c0-4 4-4 4-8M32 15c0-4 4-4 4-8M42 15c0-4 4-4 4-8"/>
        </svg>
      </span>
      <span>
        <strong>喫茶みちくさ</strong>
        <small>ゆっくりしていく、小さな喫茶店</small>
      </span>
    </a>
    <nav aria-label="メインメニュー">
      <a href="#about">お店について</a>
      <a href="#menu">メニュー</a>
      <a href="#access">アクセス</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">COFFEE &amp; SMALL BREAK</p>
        <h1>少しだけ、<br>みちくさしませんか。</h1>
        <p>自家焙煎のコーヒーと、毎朝焼くトースト。仕事の合間にも、散歩の途中にも。</p>
        <a class="hero-link" href="#menu">今日のメニューを見る</a>
      </div>
      <div class="hero-art" role="img" aria-label="湯気の立つコーヒーカップのイラスト">
        <span class="steam steam-one"></span>
        <span class="steam steam-two"></span>
        <div class="cup">
          <span class="coffee"></span>
          <span class="handle"></span>
        </div>
        <span class="saucer"></span>
      </div>
    </section>

    <section class="notice" aria-labelledby="notice-title">
      <p class="section-number">01</p>
      <div>
        <p class="eyebrow" id="notice-title">本日のお知らせ</p>
        <p class="notice-message"><?= nl2br(h($notice), false) ?></p>
      </div>
    </section>

    <section class="split-section" id="about">
      <p class="section-number">02</p>
      <div>
        <p class="eyebrow">お店について</p>
        <h2>町のすき間にある、<br>十二席の喫茶店です。</h2>
      </div>
      <p>急いで飲む日も、ぼんやり過ごす日も歓迎します。コーヒー豆は毎週少量ずつ焙煎し、香りが残るうちに使い切ります。</p>
    </section>

    <section class="menu-section" id="menu">
      <p class="section-number">03</p>
      <div class="menu-heading">
        <p class="eyebrow">定番メニュー</p>
        <h2>毎日あるものを、丁寧に。</h2>
      </div>
      <ul class="menu-list">
        <li><span>みちくさブレンド</span><strong>¥520</strong></li>
        <li><span>深煎りアイスコーヒー</span><strong>¥560</strong></li>
        <li><span>厚切りバタートースト</span><strong>¥480</strong></li>
      </ul>
    </section>

    <section class="access-section" id="access">
      <p class="section-number">04</p>
      <div>
        <p class="eyebrow">営業時間</p>
        <p class="hours">10:00—19:00</p>
        <p>水曜定休</p>
      </div>
      <div>
        <p class="eyebrow">アクセス</p>
        <p>駅の南口から徒歩6分<br>小さな赤い看板が目印です</p>
      </div>
    </section>
  </main>

  <footer>
    <span>© 喫茶みちくさ</span>
    <span>このサイトは演習用の架空サイトです</span>
  </footer>
</body>
</html>
