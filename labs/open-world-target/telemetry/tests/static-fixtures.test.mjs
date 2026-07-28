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

test("SMB disclosure and NFS ownership fixtures stay on the direct-link CIDR", async () => {
  const samba = await fixture(
    "etc/samba/smb.conf.d/open-world-target.conf",
  );
  const handover = await fixture("srv/kazekiri/handover/SHIFT-HANDOVER.txt");
  const exportsFile = await fixture(
    "etc/exports.d/open-world-target.exports",
  );
  const nfsConfig = await fixture("etc/nfs.conf.d/open-world-target.conf");
  const credentials = JSON.parse(
    await readFile(path.join(fixtures, "synthetic-credentials.json"), "utf8"),
  );

  assert.match(samba, /interfaces = lo 10\.13\.37\.10\/24/);
  assert.match(samba, /guest ok = yes/);
  assert.match(samba, /guest account = nobody/);
  assert.match(samba, /read only = yes/);
  assert.match(samba, /^\s*smb ports = 445\s*$/m);
  assert.ok(!samba.match(/^\s*smb ports\s*=.*\b139\b/m));
  assert.match(samba, /smbd\.service/);
  assert.equal(credentials.trainingOnly, true);
  assert.ok(handover.includes(credentials.accounts[0].username));
  assert.ok(handover.includes(credentials.accounts[0].password));

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
