# Work Order: Remove the guide from the Debian target

## Goal

Make the Debian bundle contain only the vulnerable world, target telemetry, and
isolated direct-link services. The public guide is no longer installed, served,
or named by the target.

## Non-goals

- Do not edit `apps/lab-guide/src`, `apps/lab-guide/cloud`, `apps/lab-guide/api`,
  or Bridge code.
- Do not weaken recovery, dual-boot, event authentication, or vulnerable-world
  tests.
- Do not give Debian a default route, upstream DNS, Wi-Fi, NAT, or forwarding.
- Do not deploy anything.

## Inputs and binding contracts

- `PROJECT_CONSTITUTION.md`
- `TASK_CONTRACT.md`
- `docs/LIVE_ARCHITECTURE.md`
- `labs/open-world-target/platform`
- `labs/open-world-target/operator`
- `apps/lab-guide/server` is retained only as a development/local fallback and
  must not be copied into the Debian target bundle.

## Owned files

- `labs/open-world-target/platform`
- `labs/open-world-target/operator`
- Target/operator portions of `README.md`
- Target-server tests under `apps/lab-guide/tests` only if an assertion refers
  to Debian hosting defaults

## Requirements

- Remove `open-world-guide.service`, guide user/group, guide files, guide port
  8080, and guide build input from the Debian bundle and vulnerable target.
- Stop mapping `lab.examserver.test` to `10.13.37.10`.
- Keep DHCP for the direct Ethernet but do not advertise target DNS as the
  resolver for public browsing. If dnsmasq remains, disable its DNS listener.
- Kali reaches target telemetry at `http://10.13.37.10:8787`; expose only the
  minimum authenticated/read-only projection endpoints required by Bridge.
- Public/operator instructions use the Vercel/ExamServer guide plus a Bridge
  pairing code. Raw target IP remains the attack target.
- Preserve a clearly named local-only fallback server for fully offline drills,
  but it runs on Kali, never Debian.

## Done

- Platform, operator, target-bundle, telemetry, and repository tests pass.
- Static search finds no active Debian service, port, DNS mapping, bundle path,
  or day-of instruction that hosts the guide on the target.
- Return at most 900 words with changed files, tests, and physical gates.
