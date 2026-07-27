import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("target page remains an ordinary site without CTF vocabulary", async () => {
  const page = await text("target/site/index.php");

  assert.doesNotMatch(page, /CTF|RCE|command injection|コマンドインジェクション/i);
  assert.match(page, /本日のお知らせ/);
});

test("target and guide have no external asset dependencies", async () => {
  const files = await Promise.all([
    text("target/site/index.php"),
    text("target/site/staff/index.php"),
    text("target/site/staff/network-check.php"),
    text("guide/index.html"),
  ]);
  const externalAsset = /<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\/(?!10\.13\.37\.10)/i;

  for (const file of files) {
    assert.doesNotMatch(file, externalAsset);
  }
});

test("the deliberate shell boundary is visibly marked for operators", async () => {
  const diagnostic = await text("target/site/staff/network-check.php");

  assert.match(diagnostic, /Intentionally vulnerable/);
  assert.match(diagnostic, /shell_exec\(\$command\)/);
});

test("participant guide verifies real homepage state instead of paste-only success", async () => {
  const guide = await text("guide/guide.mjs");

  assert.match(guide, /fetch\(`\/\?lab-check=/);
  assert.match(guide, /homepageShowsTeam/);
});

test("commands say whether they belong in Kali or the web form", async () => {
  const page = await text("guide/index.html");

  assert.match(page, /操作場所: Kaliのターミナル/);
  assert.match(page, /入力場所: Webの「接続先」欄/);
  assert.match(page, /id="whoami-experiment" hidden/);
  assert.match(page, /id="workdir-experiment" hidden/);
  assert.match(page, /<noscript>[\s\S]*127\.0\.0\.1; whoami[\s\S]*<\/noscript>/);
  assert.doesNotMatch(page, /display: block !important/);
});

test("each rebuild gets a fresh browser progress namespace", async () => {
  const guide = await text("guide/guide.mjs");
  const reset = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-reset-runtime",
  );

  assert.match(guide, /__LAB_INSTANCE_ID__/);
  assert.match(reset, /random\/uuid/);
  assert.match(reset, /s\/__LAB_INSTANCE_ID__/);
});

test("Live image requires RAM boot and has no unsafe fallback entry", async () => {
  const build = await text("live/build.sh");
  const workflow = await text("../../.github/workflows/build-live-iso.yml");
  const common = await text(
    "live/config/includes.chroot/usr/local/lib/site-lab/common.sh",
  );

  assert.match(build, /for command_name in [^\n]*wget/);
  assert.match(build, /toram nopersistence/);
  assert.match(build, /--bootappend-live-failsafe none/);
  assert.match(build, /--uefi-secure-boot enable/);
  assert.match(workflow, /live-build \\\n\s+rsync \\\n\s+wget \\/);
  assert.match(workflow, /push:\s+branches:\s+- "feat\/live-usb-b2r"/);
  assert.match(common, /site_lab_assert_live_media_in_ram/);
  assert.match(common, /source.*!= "tmpfs"/);
  assert.match(common, /filesystem.*!= "tmpfs"/);
});

test("exercise mode fails closed on disks and external network paths", async () => {
  const guard = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-guard",
  );
  const mode = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-mode",
  );
  const preflight = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-preflight",
  );
  assert.match(guard, /site_lab_assert_live_media_in_ram[\s\S]*waiting-for-usb/);
  assert.match(guard, /A physical disk appeared after the exercise started/);
  assert.match(mode, /site_lab_assert_no_physical_disks[\s\S]*systemctl start apache2/);
  assert.match(mode, /chain output \{\s+type filter hook output priority 0; policy drop;/);
  assert.match(mode, /meta l4proto tcp reject with tcp reset/);
  assert.match(preflight, /no IPv6 default route/);
  assert.match(preflight, /no other network device is connected/);
  assert.match(preflight, /no DNS server is configured/);
});

test("Codex maintenance credentials live under run and are removed for exercise", async () => {
  const wrapper = await text(
    "live/config/includes.chroot/usr/local/bin/codex-maintenance",
  );
  const common = await text(
    "live/config/includes.chroot/usr/local/lib/site-lab/common.sh",
  );
  const mode = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-mode",
  );
  const preflight = await text(
    "live/config/includes.chroot/usr/local/sbin/lab-preflight",
  );
  const packages = await text(
    "live/config/package-lists/site-takeover.list.chroot",
  );

  assert.match(wrapper, /CODEX_HOME="\$\{SITE_LAB_CODEX_RUNTIME\}/);
  assert.match(wrapper, /cli_auth_credentials_store = "file"/);
  assert.match(wrapper, /setsid codex "\$@"/);
  assert.match(wrapper, /CODEX_HOME}\/pgid/);
  assert.match(common, /SITE_LAB_CODEX_RUNTIME="\/run\/site-lab-codex"/);
  assert.match(common, /kill -TERM -- "-\$\{pgid\}"/);
  assert.match(common, /kill -KILL -- "-\$\{pgid\}"/);
  assert.match(common, /rm -rf -- "\$\{SITE_LAB_CODEX_RUNTIME\}"/);
  assert.match(mode, /site_lab_stop_codex[\s\S]*site_lab_set_state arming/);
  assert.match(packages, /^procps$/m);
  assert.match(preflight, /pgrep is available/);
  assert.match(preflight, /no Codex maintenance process remains/);
});

test("operator docs isolate both bare-metal and VirtualBox Kali", async () => {
  const kali = await text("operator/KALI-PREFLIGHT.md");
  const dayOf = await text("operator/DAY-OF.md");

  assert.match(kali, /ブリッジアダプター/);
  assert.match(kali, /アダプター2〜4は無効/);
  assert.match(kali, /CONNECT LAN/);
  assert.match(kali, /デフォルトゲートウェイ/);
  assert.match(dayOf, /sudo lab-mode maintenance/);
  assert.match(dayOf, /codex-maintenance login --device-auth/);
  assert.match(dayOf, /sudo lab-mode exercise/);
});

test("company download mode verifies release assets without writing USB", async () => {
  const bootstrap = await text("operator/company-bootstrap.ps1");
  const companyGuide = await text("operator/COMPANY-SETUP.md");

  assert.match(bootstrap, /\[switch\]\$DownloadRelease/);
  assert.match(bootstrap, /isDraft,isPrerelease,targetCommitish,assets/);
  assert.match(bootstrap, /Get-FileHash -LiteralPath \$isoPath -Algorithm SHA256/);
  assert.match(bootstrap, /BIOS.*UEFI/s);
  assert.doesNotMatch(bootstrap, /Clear-Disk|Format-Volume|Write-Disk/);
  assert.match(companyGuide, /-DownloadRelease/);
  assert.match(companyGuide, /C:\\lab\\site-takeover-release/);
});

test("root bonus reads the proof through the intentionally unsafe helper", async () => {
  const operatorGuide = await text("operator/ROOT-BONUS.md");
  const helper = await text(
    "live/config/includes.chroot/usr/local/sbin/site-maintenance",
  );
  const sudoers = await text(
    "live/config/includes.chroot/etc/sudoers.d/site-takeover-lab",
  );

  assert.match(operatorGuide, /cat \/root\/root-proof\.txt/);
  assert.match(operatorGuide, /ROOT BONUS COMPLETE/);
  assert.match(helper, /\/bin\/bash -c/);
  assert.match(sudoers, /www-data ALL=\(root\) NOPASSWD/);
});
