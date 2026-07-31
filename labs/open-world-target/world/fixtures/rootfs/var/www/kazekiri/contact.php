<?php
declare(strict_types=1);

require_once __DIR__ . "/inc/site.php";

kazekiri_guard_method(["GET", "POST"], "contact");

$topicOptions = [
    "vehicle" => "在庫車両を見たい",
    "service" => "整備を相談したい",
    "visit" => "来店方法を確認したい",
    "other" => "その他",
];
$vehicles = kazekiri_vehicles();
$method = strtoupper((string)($_SERVER["REQUEST_METHOD"] ?? "GET"));
$source = $method === "POST" ? $_POST : $_GET;
$form = [
    "name" => kazekiri_value($source, "name"),
    "email" => kazekiri_value($source, "email"),
    "topic" => kazekiri_value($source, "topic"),
    "vehicle" => kazekiri_value($source, "vehicle"),
    "visit_date" => kazekiri_value($source, "visit_date"),
    "message" => kazekiri_value($source, "message"),
    "agree" => kazekiri_value($source, "agree"),
];
if ($form["topic"] === "") {
    $form["topic"] = $form["vehicle"] !== "" ? "vehicle" : "visit";
}
$invalidVehicle = $form["vehicle"] !== "" && !isset($vehicles[$form["vehicle"]]);
if ($method === "GET" && $invalidVehicle) {
    $form["vehicle"] = "";
    $invalidVehicle = false;
}

$errors = [];
$receipt = "";
if ($method === "POST") {
    if (kazekiri_text_length($form["name"]) < 1 || kazekiri_text_length($form["name"]) > 40) {
        $errors["name"] = "お名前は40文字以内で入力してください。";
    }
    if (!filter_var($form["email"], FILTER_VALIDATE_EMAIL) || strlen($form["email"]) > 254) {
        $errors["email"] = "連絡先メールを正しい形式で入力してください。";
    }
    if (!isset($topicOptions[$form["topic"]])) {
        $errors["topic"] = "相談内容を選び直してください。";
    }
    if ($invalidVehicle) {
        $errors["vehicle"] = "在庫車両を選び直してください。";
    }
    if ($form["visit_date"] !== "") {
        $date = DateTimeImmutable::createFromFormat("!Y-m-d", $form["visit_date"]);
        $validDate = $date instanceof DateTimeImmutable
            && $date->format("Y-m-d") === $form["visit_date"];
        $today = new DateTimeImmutable("today");
        if (
            !$validDate
            || $date < $today
            || $date > $today->modify("+90 days")
        ) {
            $errors["visit_date"] = "来店希望日は今日から90日以内で入力してください。";
        }
    }
    $messageLength = kazekiri_text_length($form["message"]);
    if ($messageLength < 10 || $messageLength > 800) {
        $errors["message"] = "相談内容は10文字以上800文字以内で入力してください。";
    }
    if ($form["agree"] !== "yes") {
        $errors["agree"] = "保存されない仮受付であることを確認してください。";
    }

    if ($errors === []) {
        $receipt = "KZ-" . date("ymd") . "-" . strtoupper(substr(hash(
            "sha256",
            implode("|", [
                $form["name"],
                $form["email"],
                $form["topic"],
                $form["vehicle"],
                $form["visit_date"],
                $form["message"],
                (string)microtime(true),
            ])
        ), 0, 6));
    } else {
        http_response_code(422);
    }
}

kazekiri_site_header(
    "来店相談",
    "在庫車両の確認や整備の相談について、来店前の仮受付番号を発行します。",
    "contact"
);
?>
<main id="main">
  <header class="page-intro">
    <div class="site-width page-intro__grid">
      <div>
        <?php kazekiri_breadcrumb([["label" => "来店相談"]]); ?>
        <p class="eyebrow">VISIT &amp; CONSULTATION</p>
        <h1>来店相談</h1>
      </div>
      <p>
        在庫車両の現車確認や整備相談の内容を整理し、店頭で伝えるための仮受付番号を発行します。
        入力内容をサーバーへ保存したり、外部へ送信したりしません。
      </p>
    </div>
  </header>

  <section class="section section--tight">
    <div class="site-width contact-layout">
      <div class="contact-form-wrap">
        <?php if ($receipt !== ""): ?>
          <section class="receipt" id="contact-result" aria-live="polite" tabindex="-1">
            <p class="eyebrow">RECEIPT</p>
            <h2>仮受付番号を発行しました</h2>
            <code><?= h($receipt) ?></code>
            <p>
              この番号と相談内容は保存されません。画面を控え、来店時に受付へ伝えてください。
            </p>
            <dl>
              <div><dt>相談内容</dt><dd><?= h($topicOptions[$form["topic"]]) ?></dd></div>
              <?php if ($form["vehicle"] !== ""): ?>
                <div><dt>対象車両</dt><dd><?= h($vehicles[$form["vehicle"]]["stock_number"]) ?>　<?= h($vehicles[$form["vehicle"]]["name"]) ?></dd></div>
              <?php endif; ?>
              <?php if ($form["visit_date"] !== ""): ?>
                <div><dt>来店希望日</dt><dd><?= h($form["visit_date"]) ?></dd></div>
              <?php endif; ?>
            </dl>
            <a class="text-link" href="/contact.php">別の相談を作る</a>
          </section>
        <?php elseif ($errors !== []): ?>
          <section class="inline-state inline-state--error" id="contact-result" role="alert" tabindex="-1">
            <p class="eyebrow">CHECK FORM</p>
            <h2>入力内容を確認してください</h2>
            <p><?= count($errors) ?>か所に入力不足があります。各項目の説明を確認してください。</p>
          </section>
        <?php endif; ?>

        <?php if ($receipt === ""): ?>
          <form class="contact-form" id="contact-form" method="post" action="/contact.php#contact-result" novalidate>
            <div class="form-row">
              <label for="name">お名前 <span>必須</span></label>
              <input
                id="name"
                name="name"
                value="<?= h($form["name"]) ?>"
                maxlength="40"
                autocomplete="name"
                required
                <?= isset($errors["name"]) ? 'aria-invalid="true" aria-describedby="name-error"' : "" ?>
              >
              <?php if (isset($errors["name"])): ?><p class="field-error" id="name-error"><?= h($errors["name"]) ?></p><?php endif; ?>
            </div>

            <div class="form-row">
              <label for="email">連絡先メール <span>必須</span></label>
              <input
                id="email"
                name="email"
                type="email"
                value="<?= h($form["email"]) ?>"
                maxlength="254"
                autocomplete="email"
                required
                <?= isset($errors["email"]) ? 'aria-invalid="true" aria-describedby="email-error"' : "" ?>
              >
              <p class="field-help">形式確認だけに使用し、保存や送信はしません。</p>
              <?php if (isset($errors["email"])): ?><p class="field-error" id="email-error"><?= h($errors["email"]) ?></p><?php endif; ?>
            </div>

            <div class="form-split">
              <div class="form-row">
                <label for="topic">相談内容 <span>必須</span></label>
                <select id="topic" name="topic" required<?= isset($errors["topic"]) ? ' aria-invalid="true" aria-describedby="topic-error"' : "" ?>>
                  <?php foreach ($topicOptions as $value => $label): ?>
                    <option value="<?= h($value) ?>"<?= $form["topic"] === $value ? " selected" : "" ?>><?= h($label) ?></option>
                  <?php endforeach; ?>
                </select>
                <?php if (isset($errors["topic"])): ?><p class="field-error" id="topic-error"><?= h($errors["topic"]) ?></p><?php endif; ?>
              </div>
              <div class="form-row">
                <label for="visit_date">来店希望日 <span>任意</span></label>
                <input
                  id="visit_date"
                  name="visit_date"
                  type="date"
                  value="<?= h($form["visit_date"]) ?>"
                  <?= isset($errors["visit_date"]) ? 'aria-invalid="true" aria-describedby="visit-date-error"' : "" ?>
                >
                <?php if (isset($errors["visit_date"])): ?><p class="field-error" id="visit-date-error"><?= h($errors["visit_date"]) ?></p><?php endif; ?>
              </div>
            </div>

            <div class="form-row">
              <label for="vehicle">対象車両 <span>任意</span></label>
              <select id="vehicle" name="vehicle">
                <option value="">車両を指定しない</option>
                <?php foreach ($vehicles as $vehicle): ?>
                  <option value="<?= h($vehicle["id"]) ?>"<?= $form["vehicle"] === $vehicle["id"] ? " selected" : "" ?>>
                    <?= h($vehicle["stock_number"]) ?>　<?= h($vehicle["name"]) ?> / <?= h($vehicle["color"]) ?>
                  </option>
                <?php endforeach; ?>
              </select>
            </div>

            <div class="form-row">
              <label for="message">相談内容 <span>必須</span></label>
              <textarea
                id="message"
                name="message"
                rows="7"
                maxlength="800"
                required
                aria-describedby="message-help<?= isset($errors["message"]) ? " message-error" : "" ?>"
                <?= isset($errors["message"]) ? 'aria-invalid="true"' : "" ?>
              ><?= h($form["message"]) ?></textarea>
              <p class="field-help" id="message-help">見たい車両、気になる症状、来店時間などを10文字以上で入力してください。</p>
              <?php if (isset($errors["message"])): ?><p class="field-error" id="message-error"><?= h($errors["message"]) ?></p><?php endif; ?>
            </div>

            <div class="form-check">
              <input id="agree" name="agree" type="checkbox" value="yes"<?= $form["agree"] === "yes" ? " checked" : "" ?>>
              <label for="agree">入力内容が保存・送信されない仮受付であることを確認しました</label>
              <?php if (isset($errors["agree"])): ?><p class="field-error"><?= h($errors["agree"]) ?></p><?php endif; ?>
            </div>

            <button class="button button--primary" type="submit">仮受付番号を発行する</button>
          </form>
        <?php endif; ?>
      </div>

      <aside class="contact-aside">
        <h2>来店前に分かると助かること</h2>
        <ul>
          <li>在庫番号、または車両の排気量</li>
          <li>症状が出る速度、天候、走行時間</li>
          <li>希望する来店日と時間帯</li>
        </ul>
        <dl>
          <div><dt>営業時間</dt><dd>10:00-18:00</dd></div>
          <div><dt>整備受付</dt><dd>17:00まで</dd></div>
          <div><dt>定休日</dt><dd>火曜・水曜</dd></div>
        </dl>
        <a class="text-link" href="/faq.php">来店前のよくある質問</a>
      </aside>
    </div>
  </section>
</main>
<?php kazekiri_site_footer(); ?>
