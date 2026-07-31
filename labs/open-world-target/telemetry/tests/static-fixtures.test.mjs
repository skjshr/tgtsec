import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { WORLD } from "../../world/world-definition.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(
  testDirectory,
  "../../world/fixtures/rootfs",
);
const fixtures = path.resolve(testDirectory, "../../world/fixtures");
const platformTemplates = path.resolve(
  testDirectory,
  "../../platform/templates",
);

async function fixture(relativePath) {
  return readFile(path.join(fixtureRoot, relativePath), "utf8");
}

async function telemetryFixture(relativePath) {
  return readFile(path.resolve(testDirectory, "..", relativePath), "utf8");
}

async function platformFixture(relativePath) {
  return readFile(path.join(platformTemplates, relativePath), "utf8");
}

test("fixture manifest is synthetic and uses the cross-subsystem unit names", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(fixtures, "fixture-manifest.json"), "utf8"),
  );
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.network.targetAddress, "10.13.37.10/24");
  assert.equal(manifest.network.externalRouteRequired, false);
  assert.deepEqual(manifest.services, [
    "apache2.service",
    "dnsmasq.service",
    "ssh.service",
    "smbd.service",
    "nfs-server.service",
    "open-world-nfs-watch.service",
    "open-world-file-watch.service",
    "open-world-root-timer.timer",
    "open-world-telemetry.service",
  ]);
  assert.deepEqual(manifest.groups["lab-foothold"], [
    "www-data",
    "sales",
    "mechanic",
  ]);
  assert.deepEqual(manifest.groups["lab-events"], [
    "www-data",
    "nobody",
    "lab-telemetry",
  ]);
  assert.ok(manifest.accounts.every((account) => account.synthetic === true));
  assert.deepEqual(manifest.eventKeyProvisioning.directory, {
    path: "/etc/examserver-open-world/event-keys",
    owner: "root",
    group: "root",
    mode: "0711",
  });
  assert.deepEqual(manifest.eventKeyProvisioning.low, {
    path: "/etc/examserver-open-world/event-keys/low.key",
    owner: "root",
    group: "lab-events",
    mode: "0440",
    minimumRandomBytes: 32,
  });
  assert.deepEqual(manifest.eventKeyProvisioning.root, {
    path: "/etc/examserver-open-world/event-keys/root.key",
    owner: "root",
    group: "lab-telemetry",
    mode: "0440",
    minimumRandomBytes: 32,
  });
});

test("Web fixture is bound to the lab address and emits constants, never the raw target", async () => {
  const apache = await fixture(
    "etc/apache2/sites-available/open-world-target.conf",
  );
  const php = await fixture("var/www/kazekiri/staff/diagnostics.php");

  assert.match(apache, /Listen 10\.13\.37\.10:80/);
  assert.match(apache, /CustomLog .*"%a %t %m %U %>s"/);
  assert.ok(!apache.includes("%q"));
  assert.match(php, /shell_exec\("\/bin\/ping -c 1 " \. \$target/);
  assert.match(php, /web\.command\.execution_observed/);
  assert.ok(!php.match(/open-world-event[^;]*\$target/s));
});

test("Web fixture ships an offline multi-page business site and keeps the diagnostic boundary", async () => {
  const routeFiles = [
    "index.php",
    "inventory.php",
    "vehicle.php",
    "service.php",
    "shop.php",
    "news.php",
    "article.php",
    "faq.php",
    "contact.php",
    "staff/diagnostics.php",
  ];
  const cssFiles = [
    "site.css",
    "support.css",
    "public.css",
    "catalog.css",
    "content.css",
    "staff.css",
    "responsive.css",
    "mobile.css",
  ];
  const imageFiles = [
    "workshop-hero.webp",
    "shop-exterior-morning.webp",
    ...Array.from({ length: 6 }, (_, index) =>
      `stock-${String(index + 1).padStart(2, "0")}.webp`),
    "inspection-brake.webp",
    "service-oil-bench.webp",
    "service-tire-lift.webp",
    "parts-shelf.webp",
    "showroom-floor.webp",
    "waiting-counter.webp",
    "workshop-rain.webp",
    "area-mountain-road.webp",
  ];
  const routeSources = await Promise.all(
    routeFiles.map((relativePath) =>
      fixture(`var/www/kazekiri/${relativePath}`)),
  );
  const [home, inventory, vehicle, service, shop, news, article, faq, contact,
    diagnostics] = routeSources;
  const site = await fixture("var/www/kazekiri/inc/site.php");
  const data = await fixture("var/www/kazekiri/inc/data.php");
  const cssSources = await Promise.all(
    cssFiles.map((relativePath) =>
      fixture(`var/www/kazekiri/assets/${relativePath}`)),
  );

  for (const [index, source] of routeSources.entries()) {
    assert.match(
      source,
      /inc\/site\.php/,
      `${routeFiles[index]} must use the shared site owner`,
    );
    assert.ok(
      !source.includes("演習用の架空サイト"),
      `${routeFiles[index]} must not repeat the visible disclosure`,
    );
    assert.ok(
      !source.match(/https?:\/\/|<script\b/i),
      `${routeFiles[index]} must not request an external runtime`,
    );
  }
  assert.equal(
    site.match(/演習用の架空サイト/g)?.length,
    1,
    "the quiet footer owns the only visible exercise disclosure",
  );
  assert.match(site, /href="\/staff\/diagnostics\.php"/);
  for (const route of [
    "inventory.php",
    "service.php",
    "shop.php",
    "news.php",
    "faq.php",
    "contact.php",
  ]) {
    assert.ok(
      site.includes(`"/${route}"`),
      `shared navigation must own /${route}`,
    );
  }

  assert.match(home, /workshop-hero\.webp/);
  assert.match(home, /shop-exterior-morning\.webp/);
  assert.ok(!home.includes("hero__caption"));
  assert.ok(!site.match(/TRAINING|演習専用/));
  for (const source of [...routeSources, site, data]) {
    assert.ok(
      !source.match(/[–—]| · /),
      "visible fixture copy must not use decorative dash separators",
    );
  }
  assert.match(inventory, /"category"\s*=>\s*kazekiri_value/);
  assert.match(inventory, /"availability"\s*=>\s*kazekiri_value/);
  assert.match(inventory, /<select name="<\?=\s*h\(\$name\)\s*\?>">/);
  assert.match(vehicle, /支払総額目安/);
  assert.match(vehicle, /整備記録/);
  assert.match(service, /kazekiri_services/);
  assert.match(shop, /showroom-floor\.webp/);
  assert.match(news, /kazekiri_articles/);
  assert.match(article, /kazekiri_not_found/);
  assert.match(faq, /kazekiri_faq_groups/);
  assert.match(contact, /<form\b[^>]*\bmethod="post"/);
  assert.match(contact, /http_response_code\(422\)/);
  assert.match(contact, /入力内容をサーバーへ保存/);
  assert.ok(!contact.match(/\bmail\s*\(|file_put_contents|PDO|mysqli|curl_/));

  assert.equal((data.match(/"id" => "kz-/g) ?? []).length, 6);
  assert.equal((data.match(/"total" =>/g) ?? []).length, 6);
  for (const filename of imageFiles) {
    assert.ok(data.includes(filename) || home.includes(filename) ||
      shop.includes(filename), `${filename} must be referenced by site data`);
    const imagePath = path.join(
      fixtureRoot,
      "var/www/kazekiri/assets",
      filename,
    );
    const image = await readFile(imagePath);
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
    await access(imagePath);
  }

  assert.match(diagnostics, /<form\b[^>]*\bmethod="post"/);
  assert.match(diagnostics, /action="\/staff\/diagnostics\.php#diagnostic-result"/);
  assert.match(diagnostics, /<input\b[^>]*\bid="target"/s);
  assert.match(diagnostics, /\bname="target"/);
  assert.ok(!diagnostics.includes("pattern="));
  assert.match(diagnostics, /aria-live="polite"/);
  assert.match(diagnostics, /保守照合コード/);

  for (const [index, css] of cssSources.entries()) {
    assert.ok(
      !css.match(/@import|https?:\/\//),
      `${cssFiles[index]} must remain local-only`,
    );
    assert.ok(
      !css.includes("hero__caption"),
      `${cssFiles[index]} must not restore a hero image overlay label`,
    );
  }
});

test("SMB disclosure and NFS ownership fixtures stay on the direct-link CIDR", async () => {
  const samba = await fixture(
    "etc/samba/smb.conf.d/open-world-target.conf",
  );
  const handover = await fixture("srv/kazekiri/handover/SHIFT-HANDOVER.txt");
  const exportsFile = await fixture(
    "etc/exports.d/open-world-target.exports",
  );
  const nfsConfig = await fixture("etc/nfs.conf.d/open-world-target.conf");
  const credentialSpec = JSON.parse(
    await readFile(
      path.join(fixtures, "synthetic-credential-spec.json"),
      "utf8",
    ),
  );

  assert.match(samba, /interfaces = lo 10\.13\.37\.10\/24/);
  assert.match(samba, /guest ok = yes/);
  assert.match(samba, /guest account = nobody/);
  assert.match(samba, /read only = yes/);
  assert.match(samba, /^\s*smb ports = 445\s*$/m);
  assert.ok(!samba.match(/^\s*smb ports\s*=.*\b139\b/m));
  assert.match(samba, /smbd\.service/);
  assert.equal(credentialSpec.trainingOnly, true);
  assert.ok(handover.includes(credentialSpec.accounts[0].username));
  assert.equal(
    Object.hasOwn(credentialSpec.accounts[0], "password"),
    false,
  );
  assert.match(handover, /@@BUILD_TIME_SALES_PASSWORD@@/);
  assert.ok(!/Kaze-[a-f0-9]{32,}/.test(handover));

  assert.match(exportsFile, /10\.13\.37\.0\/24/);
  assert.match(exportsFile, /fsid=0/);
  assert.match(exportsFile, /all_squash/);
  assert.match(exportsFile, /anonuid=1102/);
  assert.ok(!exportsFile.includes("no_root_squash"));
  assert.match(nfsConfig, /\[nfsd\]/);
  assert.match(nfsConfig, /vers2 = n/);
  assert.match(nfsConfig, /vers3 = n/);
  assert.match(nfsConfig, /vers4 = y/);
  assert.match(nfsConfig, /tcp = y/);
  assert.match(nfsConfig, /udp = n/);
  assert.match(nfsConfig, /port = 2049/);
  assert.match(nfsConfig, /\[mountd\]\s+port = 20048/);
  const nfsHypothesis = WORLD.hypotheses.find(
    (hypothesis) => hypothesis.id === "hyp-nfs-ownership",
  );
  assert.ok(!JSON.stringify(nfsHypothesis).includes("showmount"));
  assert.match(
    nfsHypothesis.hints[2].body,
    /mount -t nfs4 -o vers=4,proto=tcp 10\.13\.37\.10:\//,
  );
});

test("sudo, timer, and SUID fixtures express three distinct training-only root boundaries", async () => {
  const sudoers = await fixture("etc/sudoers.d/open-world-target");
  const helper = await fixture("usr/local/sbin/kazekiri-maintenance");
  const timer = await fixture(
    "etc/systemd/system/open-world-root-timer.timer",
  );
  const timerService = await fixture(
    "etc/systemd/system/open-world-root-timer.service",
  );
  const timerCheck = await fixture("usr/local/libexec/open-world-timer-check");
  const suidSource = await fixture("usr/local/src/kazekiri-report.c");

  assert.match(
    sudoers,
    /%lab-foothold ALL=\(root\) NOPASSWD: \/usr\/local\/sbin\/kazekiri-maintenance/,
  );
  assert.match(helper, /\/srv\/kazekiri\/maintenance-hooks\/\*/);
  assert.match(helper, /\/root\/route-flags\/SUDO\.flag/);

  assert.match(timer, /Unit=open-world-root-timer\.service/);
  assert.match(timerService, /User=root/);
  assert.match(
    timerService,
    /ExecStart=\/bin\/sh \/opt\/kazekiri\/maintenance\/nightly\.sh/,
  );
  assert.match(timerCheck, /cmp -s "\$payload" "\$golden"/);
  assert.match(timerCheck, /\/root\/route-flags\/TIMER\.flag/);

  assert.match(suidSource, /setuid\(0\)/);
  assert.match(
    suidSource,
    /execlp\("kazekiri-report-render", "kazekiri-report-render"/,
  );
  assert.match(suidSource, /\/root\/route-flags\/SUID\.flag/);
});

test("bounded IN_ACCESS and PAM adapters map only fixed identities to allowlisted routes", async () => {
  const fileWatcher = await platformFixture(
    "usr/local/libexec/open-world-file-watch",
  );
  const fileWatcherUnit = await platformFixture(
    "etc/systemd/system/open-world-file-watch.service",
  );
  const nfsWatcher = await fixture(
    "usr/local/libexec/open-world-nfs-watch",
  );
  const nfsWatcherUnit = await fixture(
    "etc/systemd/system/open-world-nfs-watch.service",
  );
  const nfsServerDropIn = await fixture(
    "etc/systemd/system/nfs-server.service.d/open-world-watch.conf",
  );
  const pamAdapter = await fixture(
    "usr/local/libexec/open-world-ssh-session-event",
  );

  for (const identity of [
    "clue-sudo-helper",
    "clue-writable-timer",
    "clue-unsafe-path",
    "root-path-sudo",
    "root-path-timer",
    "root-path-suid",
    "root-common",
  ]) {
    assert.ok(fileWatcher.includes(identity));
  }
  assert.match(fileWatcher, /inotify_init1/);
  assert.match(fileWatcher, /IN_ACCESS/);
  assert.match(fileWatcher, /fixed event delivery failed/);
  assert.ok(!fileWatcher.includes("auditd.service"));
  assert.ok(!fileWatcher.includes("SYSCALL"));
  assert.ok(!fileWatcher.includes("PROCTITLE"));
  assert.match(fileWatcherUnit, /^Type=notify$/m);
  assert.match(fileWatcherUnit, /^Restart=no$/m);
  assert.match(
    fileWatcherUnit,
    /^Before=apache2\.service nfs-server\.service open-world-root-timer\.timer smbd\.service ssh\.service$/m,
  );
  assert.match(
    fileWatcherUnit,
    /^OnFailure=open-world-vulnerable-failure\.service$/m,
  );
  assert.match(
    fileWatcherUnit,
    /^ExecStart=\/usr\/local\/libexec\/open-world-file-watch$/m,
  );
  assert.match(nfsWatcher, /inotify_init1/);
  assert.match(nfsWatcher, /IN_ACCESS/);
  assert.match(nfsWatcher, /READY=1/);
  assert.match(nfsWatcher, /entrance-nfs-workshop/);
  assert.match(nfsWatcher, /nfs\.workshop\.flag_read/);
  assert.match(nfsWatcherUnit, /^User=root$/m);
  assert.match(
    nfsWatcherUnit,
    /^Requires=open-world-telemetry\.socket$/m,
  );
  assert.match(nfsWatcherUnit, /^Before=nfs-server\.service$/m);
  assert.match(nfsWatcherUnit, /^Type=notify$/m);
  assert.ok(!nfsWatcherUnit.includes("ConditionPathExists"));
  assert.match(
    nfsWatcherUnit,
    /^ExecStartPre=\/usr\/bin\/test -f \/run\/open-world-lab\/exercise-ready$/m,
  );
  assert.match(
    nfsWatcherUnit,
    /^ExecStart=\/usr\/local\/libexec\/open-world-nfs-watch$/m,
  );
  assert.match(
    nfsServerDropIn,
    /^BindsTo=open-world-nfs-watch\.service$/m,
  );
  assert.match(
    nfsServerDropIn,
    /^After=open-world-nfs-watch\.service$/m,
  );
  assert.match(pamAdapter, /case "\$\{PAM_USER:-\}"/);
  assert.match(pamAdapter, /ssh\.sales\.session_opened/);
  assert.match(pamAdapter, /ssh\.mechanic\.session_opened/);
});

test("every exercise-owned unit stops with the vulnerable target", async () => {
  const fixtureUnits = [
    "etc/systemd/system/apache2.service.d/open-world-target.conf",
    "etc/systemd/system/ssh.service.d/open-world-target.conf",
    "etc/systemd/system/smbd.service.d/open-world-target.conf",
    "etc/systemd/system/nfs-server.service.d/open-world-watch.conf",
    "etc/systemd/system/open-world-nfs-watch.service",
    "etc/systemd/system/open-world-root-timer.service",
    "etc/systemd/system/open-world-root-timer.timer",
  ];
  const telemetryUnits = [
    "systemd/open-world-telemetry.service",
    "systemd/open-world-telemetry.socket",
  ];
  const fileWatcherUnit = await platformFixture(
    "etc/systemd/system/open-world-file-watch.service",
  );

  for (const relativePath of fixtureUnits) {
    const unit = await fixture(relativePath);
    assert.match(
      unit,
      /^PartOf=open-world-vulnerable\.target$/m,
      `${relativePath} must stop with open-world-vulnerable.target`,
    );
  }
  for (const relativePath of telemetryUnits) {
    const unit = await telemetryFixture(relativePath);
    assert.match(
      unit,
      /^PartOf=open-world-vulnerable\.target$/m,
      `${relativePath} must stop with open-world-vulnerable.target`,
    );
  }
  assert.match(
    fileWatcherUnit,
    /^PartOf=open-world-vulnerable\.target$/m,
  );

  for (const relativePath of fixtureUnits.slice(0, 4)) {
    const dropIn = await fixture(relativePath);
    assert.ok(
      !dropIn.includes("[Install]"),
      `${relativePath} must not add a boot enablement alias`,
    );
  }
});

test("every fixture event tuple exists in the world allowlist", async () => {
  const files = [
    "var/www/kazekiri/staff/diagnostics.php",
    "etc/samba/smb.conf.d/open-world-target.conf",
    "usr/local/libexec/open-world-ssh-session-event",
    "usr/local/libexec/open-world-nfs-watch",
    "usr/local/sbin/kazekiri-maintenance",
    "usr/local/libexec/open-world-timer-check",
    "usr/local/src/kazekiri-report.c",
  ];
  const combined = (
    await Promise.all(files.map((relativePath) => fixture(relativePath)))
  ).join("\n") + "\n" + await platformFixture(
    "usr/local/libexec/open-world-file-watch",
  );

  for (const route of WORLD.eventRoutes) {
    assert.ok(
      combined.includes(route.nodeId),
      `fixture must reference node ${route.nodeId}`,
    );
    assert.ok(
      combined.includes(route.sourceId),
      `fixture must reference source ${route.sourceId}`,
    );
    assert.ok(
      combined.includes(route.evidenceCode),
      `fixture must reference evidence ${route.evidenceCode}`,
    );
  }
});

test("all flag placement parent paths have an ownership or fixture boundary", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(fixtures, "fixture-manifest.json"), "utf8"),
  );
  const ownershipPaths = manifest.requiredOwnership.map((entry) =>
    entry.path.replace(/^\//, ""),
  );

  for (const flag of WORLD.flags) {
    const parent = path.posix.dirname(flag.location);
    const covered =
      flag.category === "windows" ||
      ownershipPaths.some(
        (ownedPath) =>
          parent === ownedPath || parent.startsWith(`${ownedPath}/`),
      ) ||
      ["home/sales", "root", "root/route-flags"].some(
        (base) => parent === base || parent.startsWith(`${base}/`),
      );
    assert.ok(covered, `flag parent needs an ownership boundary: ${parent}`);
  }
});

test("required static fixture files exist", async () => {
  await Promise.all([
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/open-world-root-timer.timer",
      ),
    ),
    access(
      path.join(
        platformTemplates,
        "etc/systemd/system/open-world-file-watch.service",
      ),
    ),
    access(
      path.join(
        platformTemplates,
        "usr/local/libexec/open-world-file-watch",
      ),
    ),
    access(path.join(fixtureRoot, "etc/exports.d/open-world-target.exports")),
    access(path.join(fixtureRoot, "etc/sudoers.d/open-world-target")),
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/open-world-nfs-watch.service",
      ),
    ),
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/nfs-server.service.d/open-world-watch.conf",
      ),
    ),
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/apache2.service.d/open-world-target.conf",
      ),
    ),
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/ssh.service.d/open-world-target.conf",
      ),
    ),
    access(
      path.join(
        fixtureRoot,
        "etc/systemd/system/smbd.service.d/open-world-target.conf",
      ),
    ),
    access(
      path.join(
        fixtureRoot,
        "usr/local/libexec/open-world-nfs-watch",
      ),
    ),
    access(path.join(fixtureRoot, "usr/local/src/kazekiri-report.c")),
  ]);
});
