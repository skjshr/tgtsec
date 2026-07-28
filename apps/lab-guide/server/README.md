# Kali local-only fallback server

`server/index.mjs` is the dependency-free fallback for a fully offline drill.
It runs on Kali, serves `dist/client` on loopback, and forwards only
`/api/session/*` to the direct-link target telemetry API. It injects the
Bridge bearer token server-side; the browser never receives that token.

The normal participant path is the public Vercel/ExamServer guide selected by
`LAB_PUBLIC_ORIGIN`, followed by a short-lived pairing code from Kali Bridge.
This fallback is separate and must never be installed or run on Debian.

From a repository copy on Kali:

```text
npm --prefix apps/lab-guide run build
read -rsp 'Target telemetry token: ' BRIDGE_TARGET_TOKEN
export BRIDGE_TARGET_TOKEN
printf '\n'
LAB_GUIDE_HOST=127.0.0.1 \
LAB_GUIDE_PORT=8080 \
LAB_TELEMETRY_HOST=10.13.37.10 \
LAB_TELEMETRY_PORT=8787 \
node apps/lab-guide/server/index.mjs
```

Open `http://127.0.0.1:8080/?local=1` in Kali's own browser. The server defaults
to guide loopback `127.0.0.1:8080` and target telemetry
`10.13.37.10:8787`. `LAB_GUIDE_DIST` can select an alternate built client.
`BRIDGE_TARGET_TOKEN` is required, must contain 32–512 visible
non-whitespace characters, and must not be written to logs or evidence.
