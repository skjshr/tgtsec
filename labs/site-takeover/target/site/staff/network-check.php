<?php

declare(strict_types=1);

$host = '';
$output = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $host = trim((string) ($_POST['host'] ?? ''));

    if ($host !== '') {
        chdir(__DIR__);
        // Intentionally vulnerable for this isolated, authorized training lab.
        // Do not copy this pattern into a real application.
        $command = '/bin/ping -c 1 -W 1 ' . $host . ' 2>&1';
        $output = (string) shell_exec($command);
    }
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>接続先の確認 | スタッフ用ツール</title>
  <link rel="stylesheet" href="/assets/staff.css">
</head>
<body>
  <main class="staff-shell">
    <a class="back-link" href="/staff/">← ツール一覧へ</a>
    <p class="staff-label">NETWORK CHECK</p>
    <h1>接続先の確認</h1>
    <p>接続先のIPアドレスまたはホスト名を入力してください。</p>

    <form method="post">
      <label for="host">接続先</label>
      <div class="field-row">
        <input id="host" name="host" value="<?= h($host) ?>" placeholder="例: 127.0.0.1" autocomplete="off">
        <button type="submit">確認する</button>
      </div>
    </form>

    <?php if ($host !== ''): ?>
      <section class="result" aria-live="polite">
        <h2>確認結果</h2>
        <pre><?= h($output !== '' ? $output : '応答はありませんでした。') ?></pre>
      </section>
    <?php endif; ?>
  </main>
</body>
</html>
