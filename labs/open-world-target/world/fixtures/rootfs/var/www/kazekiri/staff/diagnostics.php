<?php
declare(strict_types=1);

require_once dirname(__DIR__) . "/inc/site.php";

kazekiri_guard_method(["GET", "POST"], "staff", true);

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
$verificationCode = trim((string)$entryFlag);

kazekiri_site_header(
    "接続先の疎通確認",
    "整備端末、プリンター、保管サーバーへの基本接続を確認するスタッフ用画面です。",
    "staff",
    true
);
?>
<main class="site-width staff-shell" id="main">
  <nav aria-label="パンくず">
    <ol class="breadcrumb">
      <li><a href="/">公開サイト</a></li>
      <li>整備ネットワーク</li>
      <li aria-current="page">疎通確認</li>
    </ol>
  </nav>

  <div class="staff-title">
    <div>
      <p class="staff-title__eyebrow">NETWORK UTILITY</p>
      <h1>接続先の疎通確認</h1>
      <p class="staff-title__description">
        整備端末、プリンター、保管サーバーへの基本接続を確認します。
        対象のIPv4アドレスまたはホスト名を入力してください。
      </p>
    </div>
    <p class="staff-title__id">UTILITY ID<br>KZ-NETCHECK 2.4</p>
  </div>

  <div class="staff-grid">
    <section class="diagnostic-panel" aria-labelledby="diagnostic-title">
      <div class="diagnostic-panel__header">
        <h2 id="diagnostic-title">疎通診断</h2>
        <p>ICMP echoを1回送信し、到達結果を表示します。</p>
      </div>
      <form class="diagnostic-form" method="post" action="/staff/diagnostics.php#diagnostic-result">
        <label class="field-label" for="target">診断対象（IPv4 / ホスト名）</label>
        <div class="field-control">
          <input
            id="target"
            name="target"
            value="<?= h($target) ?>"
            placeholder="例: 127.0.0.1"
            maxlength="160"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            aria-describedby="target-help"
            required
          >
          <button type="submit">疎通診断を実行</button>
        </div>
        <p class="field-help" id="target-help">
          応答まで数秒かかる場合があります。対象名は管理台帳を確認してください。
        </p>
      </form>

      <?php if ($output !== ""): ?>
        <section
          class="result-panel"
          id="diagnostic-result"
          aria-labelledby="result-title"
          aria-live="polite"
          tabindex="-1"
        >
          <div class="result-panel__header">
            <span id="result-title">診断結果 / OUTPUT</span>
            <span class="result-panel__status">COMPLETE</span>
          </div>
          <pre><?= h($output) ?></pre>
        </section>
      <?php endif; ?>
    </section>

    <aside class="staff-rail" aria-label="診断環境情報">
      <section class="staff-card">
        <h2>実行環境</h2>
        <dl>
          <div><dt>拠点</dt><dd>本店整備棟</dd></div>
          <div><dt>セグメント</dt><dd>SERVICE-LAN</dd></div>
          <div><dt>機能</dt><dd>PING / 1 PACKET</dd></div>
          <div><dt>状態</dt><dd>AVAILABLE</dd></div>
        </dl>
      </section>

      <section class="staff-card" aria-labelledby="verification-title">
        <h2 id="verification-title">保守照合コード</h2>
        <p class="staff-card__note">作業記録と照合する際に使用します。</p>
        <?php if ($verificationCode !== ""): ?>
          <code class="verification-code"><?= h($verificationCode) ?></code>
        <?php else: ?>
          <p class="verification-empty">照合コードは現在発行されていません。</p>
        <?php endif; ?>
      </section>

      <section class="staff-card">
        <h2>運用メモ</h2>
        <p class="staff-card__note">
          診断は1回だけ送信します。応答がない場合は、対象名と整備端末の接続を確認してください。
        </p>
      </section>
    </aside>
  </div>
</main>
<?php kazekiri_site_footer(true); ?>
