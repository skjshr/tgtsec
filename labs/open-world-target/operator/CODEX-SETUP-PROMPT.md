# Codex target setup work order

You are preparing the authorized Debian Boot2Root target in this repository.
This is a production setup task, not a demo.

## Goal

Produce a reviewed installation plan and verified target bundle for the current
dedicated-disk Debian 13 amd64 notebook. The completed exercise must be operable from Kali,
with the live guide showing confirmed state, next-step choices, and explanations.

## Mandatory boundaries

- Read `PROJECT_CONSTITUTION.md`, `TASK_CONTRACT.md`,
  `labs/open-world-target/platform/README.md`, and
  `labs/open-world-target/operator/PREPARE-TARGET.md` before acting.
- Work only inside this checkout until an operator explicitly approves a
  documented `sudo open-world-platform ... --apply` command.
- Do not repartition disks, format filesystems, edit EFI, create a golden image,
  enable exercise mode, or run recovery.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Do not print or persist GitHub credentials, Codex credentials, API keys,
  telemetry tokens, flag strings, or private answers.
- Treat GitHub as a public anonymous source only. Do not run GitHub login or
  create a GitHub token.
- Do not copy the repository, `.git`, build-time flag/credential generators,
  Codex state, or external credential state into the target bundle or installed
  target. Only generated exercise values may enter their declared runtime paths.
- Keep the target Debian-only: exactly 13 optional Debian flags and no
  Windows partition, mount, role, or recovery dependency.
- Stop if the live identity is not Debian 13 amd64/x86_64 or if the repository
  tests fail.

## Required result

1. Record the repository commit and `codex --version`.
2. Run `npm ci --prefix apps/lab-guide` and `npm run check`.
3. Collect the read-only target identity and profile inputs described in
   `PREPARE-TARGET.md`; never guess disk, PARTUUID, NIC, or recovery values.
4. Build and verify the deterministic platform overlay and the target bundle;
   each bundle build must generate fresh optional flags and the synthetic sales
   credential.
5. Produce the exact dry-run install commands and hashes for operator review.
6. Do not add `--apply`. Hand the reviewed plan back to the operator.

Your final response must list completed checks, generated artifact paths and
hashes, commands still awaiting operator approval, and every physical gate that
remains not run.
