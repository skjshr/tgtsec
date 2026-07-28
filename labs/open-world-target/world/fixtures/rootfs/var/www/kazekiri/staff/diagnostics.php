<?php
declare(strict_types=1);

function emit_lab_event(string $kind, string $node, string $evidence): void
{
    $parts = [
        "/usr/local/bin/open-world-event",
        "--kind", $kind,
        "--node", $node,
        "--source", "apache2.service",
        "--evidence", $evidence,
    ];
    $command = implode(" ", array_map("escapeshellarg", $parts));
    @exec($command . " >/dev/null 2>&1");
}

emit_lab_event(
    "entry.discovered",
    "entrance-web-diagnostics",
    "web.diagnostics.opened"
);

$target = "";
$output = "";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $target = substr((string)($_POST["target"] ?? ""), 0, 160);
    if (preg_match('/[;&|`$()<>\\r\\n]/', $target) === 1) {
        emit_lab_event(
            "foothold.acquired",
            "foothold-www-data",
            "web.command.execution_observed"
        );
    }

    // TRAINING-ONLY: command concatenation is the intentional Web entrance.
    // Never copy this pattern into a real service.
    $output = (string)shell_exec("/bin/ping -c 1 " . $target . " 2>&1");
}

$entryFlag = @file_get_contents(
    "/var/lib/open-world/flags/entry-web.flag"
);
?><!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>接続診断 | 風切モータース</title>
  <style>
    body { max-width: 48rem; margin: 3rem auto; padding: 0 1rem; color: #1f1b16; background: #f7f5f1; font-family: sans-serif; line-height: 1.6; }
    main { border: 1px solid #ded6c9; background: #fffdfa; padding: 1.5rem; }
    label, input, button { display: block; width: 100%; box-sizing: border-box; }
    input, button { min-height: 44px; margin-top: .5rem; }
    pre { overflow-wrap: anywhere; white-space: pre-wrap; background: #f0ece5; padding: 1rem; }
  </style>
</head>
<body>
  <main>
    <p>演習専用・スタッフ向け</p>
    <h1>接続診断</h1>
    <p>確認コード: <?= htmlspecialchars(trim((string)$entryFlag), ENT_QUOTES, "UTF-8") ?></p>
    <form method="post">
      <label for="target">確認先</label>
      <input id="target" name="target" value="<?= htmlspecialchars($target, ENT_QUOTES, "UTF-8") ?>" placeholder="127.0.0.1">
      <button type="submit">疎通を確認</button>
    </form>
    <?php if ($output !== ""): ?>
      <h2>結果</h2>
      <pre><?= htmlspecialchars($output, ENT_QUOTES, "UTF-8") ?></pre>
    <?php endif; ?>
  </main>
</body>
</html>
