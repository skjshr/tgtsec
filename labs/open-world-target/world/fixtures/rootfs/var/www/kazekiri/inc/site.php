<?php
declare(strict_types=1);

require_once __DIR__ . "/data.php";

date_default_timezone_set("Asia/Tokyo");

function h(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES, "UTF-8");
}

function kazekiri_text_length(string $value): int
{
    if (function_exists("mb_strlen")) {
        return mb_strlen($value, "UTF-8");
    }
    $characters = preg_split("//u", $value, -1, PREG_SPLIT_NO_EMPTY);
    return is_array($characters) ? count($characters) : strlen($value);
}

function kazekiri_value(array $source, string $key): string
{
    $value = $source[$key] ?? "";
    return is_string($value) ? trim($value) : "";
}

function kazekiri_image(
    string $filename,
    string $alt,
    int $width,
    int $height,
    string $className = "",
    bool $priority = false
): string {
    $asset = dirname(__DIR__) . "/assets/" . $filename;
    $class = trim("business-photo " . $className);
    if (!is_file($asset)) {
        $ratio = match (true) {
            $width * 2 === $height * 3 => "image-fallback--three-two",
            $width * 3 === $height * 4 => "image-fallback--four-three",
            $width * 9 === $height * 16 => "image-fallback--sixteen-nine",
            default => "image-fallback--wide",
        };
        return sprintf(
            '<div class="%s image-fallback %s" role="img" aria-label="%s"><span>写真を準備しています</span></div>',
            h($class),
            h($ratio),
            h($alt)
        );
    }

    $loading = $priority
        ? ' fetchpriority="high"'
        : ' loading="lazy" decoding="async"';
    return sprintf(
        '<img class="%s" src="/assets/%s" width="%d" height="%d" alt="%s"%s>',
        h($class),
        h($filename),
        $width,
        $height,
        h($alt),
        $loading
    );
}

function kazekiri_public_navigation(): array
{
    return [
        "inventory" => ["/inventory.php", "在庫車両"],
        "service" => ["/service.php", "整備・点検"],
        "shop" => ["/shop.php", "店舗案内"],
        "news" => ["/news.php", "お知らせ"],
        "faq" => ["/faq.php", "よくある質問"],
        "contact" => ["/contact.php", "来店相談"],
    ];
}

function kazekiri_site_header(
    string $title,
    string $description,
    string $current = "",
    bool $staff = false
): void {
    $fullTitle = $current === "home"
        ? "風切モータース | 中古バイク・整備"
        : $title . " | 風切モータース";
    ?>
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="<?= h($description) ?>">
  <?php if ($staff): ?>
    <meta name="robots" content="noindex, nofollow">
  <?php endif; ?>
  <title><?= h($fullTitle) ?></title>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/support.css">
  <?php if ($staff): ?>
    <link rel="stylesheet" href="/assets/staff.css">
  <?php else: ?>
    <link rel="stylesheet" href="/assets/public.css">
    <link rel="stylesheet" href="/assets/catalog.css">
    <link rel="stylesheet" href="/assets/content.css">
  <?php endif; ?>
  <link rel="stylesheet" href="/assets/responsive.css">
  <link rel="stylesheet" href="/assets/mobile.css">
</head>
<body class="<?= $staff ? "staff-body" : "public-body" ?>">
  <a class="skip-link" href="#main">本文へ移動</a>
  <?php if ($staff): ?>
    <header class="staff-masthead">
      <div class="site-width staff-masthead__inner">
        <?php kazekiri_brand("SERVICE DESK / STAFF TOOLS"); ?>
        <div class="staff-environment">
          <span class="staff-environment__status">SYSTEM ONLINE</span>
          <a href="/">公開サイトへ</a>
        </div>
      </div>
    </header>
  <?php else: ?>
    <div class="utility-bar">
      <div class="site-width utility-bar__inner">
        <p>本日の整備受付　17:00まで</p>
        <div class="utility-bar__links">
          <span>営業時間 10:00-18:00　火・水 定休</span>
          <a href="/staff/diagnostics.php">スタッフ用</a>
        </div>
      </div>
    </div>
    <header class="site-header">
      <div class="site-width site-header__inner">
        <?php kazekiri_brand("USED MOTORCYCLES / SERVICE"); ?>
        <nav class="site-nav" aria-label="メインナビゲーション">
          <?php foreach (kazekiri_public_navigation() as $key => [$href, $label]): ?>
            <a href="<?= h($href) ?>"<?= $current === $key ? ' aria-current="page"' : "" ?>><?= h($label) ?></a>
          <?php endforeach; ?>
        </nav>
      </div>
    </header>
  <?php endif; ?>
<?php
}

function kazekiri_brand(string $tagline): void
{
    ?>
    <a class="brand" href="/" aria-label="風切モータース ホーム">
      <span class="brand__mark" aria-hidden="true"></span>
      <span class="brand__copy">
        <span class="brand__name">風切モータース</span>
        <span class="brand__tagline"><?= h($tagline) ?></span>
      </span>
    </a>
    <?php
}

function kazekiri_site_footer(bool $staff = false): void
{
    ?>
  <footer class="<?= $staff ? "staff-footer" : "site-footer" ?>">
    <div class="site-width footer-grid">
      <div>
        <?php kazekiri_brand($staff ? "SERVICE DESK / STAFF TOOLS" : "USED MOTORCYCLES / SERVICE"); ?>
        <p class="footer-note">
          販売車両の状態と整備内容は、店頭で記録を見ながらご案内します。
        </p>
      </div>
      <nav class="footer-nav" aria-label="フッターナビゲーション">
        <?php foreach (kazekiri_public_navigation() as [$href, $label]): ?>
          <a href="<?= h($href) ?>"><?= h($label) ?></a>
        <?php endforeach; ?>
        <a href="/staff/diagnostics.php">スタッフツール</a>
      </nav>
      <dl class="footer-hours">
        <div><dt>営業時間</dt><dd>10:00-18:00</dd></div>
        <div><dt>整備受付</dt><dd>17:00まで</dd></div>
        <div><dt>定休日</dt><dd>火曜・水曜</dd></div>
      </dl>
    </div>
    <div class="site-width footer-legal">
      このサイトは閉鎖されたセキュリティ演習用の架空サイトです。実在の店舗、車両、顧客とは関係ありません。
    </div>
  </footer>
</body>
</html>
<?php
}

function kazekiri_breadcrumb(array $items): void
{
    ?>
    <nav aria-label="パンくず">
      <ol class="breadcrumb">
        <li><a href="/">ホーム</a></li>
        <?php foreach ($items as $index => $item): ?>
          <?php $last = $index === array_key_last($items); ?>
          <li<?= $last ? ' aria-current="page"' : "" ?>>
            <?php if (!$last && isset($item["href"])): ?>
              <a href="<?= h($item["href"]) ?>"><?= h($item["label"]) ?></a>
            <?php else: ?>
              <?= h($item["label"]) ?>
            <?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ol>
    </nav>
    <?php
}

function kazekiri_guard_method(array $allowed, string $current, bool $staff = false): void
{
    $method = strtoupper((string)($_SERVER["REQUEST_METHOD"] ?? "GET"));
    if (in_array($method, $allowed, true)) {
        return;
    }

    http_response_code(405);
    header("Allow: " . implode(", ", $allowed));
    kazekiri_site_header(
        "操作を完了できません",
        "このページでは指定された操作を受け付けていません。",
        $current,
        $staff
    );
    ?>
    <main class="site-width state-page" id="main">
      <p class="eyebrow">METHOD NOT ALLOWED</p>
      <h1>この操作は受け付けていません</h1>
      <p>ページのリンクから開き直してください。入力した内容は保存されていません。</p>
      <a class="text-link" href="/">ホームへ戻る</a>
    </main>
    <?php
    kazekiri_site_footer($staff);
    exit;
}

function kazekiri_not_found(
    string $current,
    string $title,
    string $message,
    string $returnHref,
    string $returnLabel
): never {
    http_response_code(404);
    kazekiri_site_header($title, $message, $current);
    ?>
    <main class="site-width state-page" id="main">
      <p class="eyebrow">NOT FOUND</p>
      <h1><?= h($title) ?></h1>
      <p><?= h($message) ?></p>
      <a class="button button--primary" href="<?= h($returnHref) ?>"><?= h($returnLabel) ?></a>
    </main>
    <?php
    kazekiri_site_footer();
    exit;
}
