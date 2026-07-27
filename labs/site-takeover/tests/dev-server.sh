#!/usr/bin/env bash

set -Eeuo pipefail

readonly source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly runtime_root="/tmp/site-takeover-dev"
readonly server_pattern="php -S 0.0.0.0:8137 -t ${runtime_root}/public"

stop_server() {
  pkill -f "${server_pattern}" >/dev/null 2>&1 || true
}

start_server() {
  [[ "${runtime_root}" == "/tmp/site-takeover-dev" ]] || exit 1
  stop_server
  rm -rf -- "${runtime_root}"
  install -d -m 0755 "${runtime_root}/public" "${runtime_root}/guide" "${runtime_root}/data"
  cp -a "${source_root}/target/site/." "${runtime_root}/public/"
  cp -a "${source_root}/guide/." "${runtime_root}/guide/"
  ln -s ../guide "${runtime_root}/public/start"
  sed -i 's#http://10\.13\.37\.10#http://127.0.0.1:8137#g' "${runtime_root}/guide/index.html"

  printf '%s\n' '本日は通常どおり営業しています。' > "${runtime_root}/data/announcement.txt"
  chown -R root:root "${runtime_root}/public" "${runtime_root}/guide"
  chown root:www-data "${runtime_root}/data" "${runtime_root}/data/announcement.txt"
  chmod 0775 "${runtime_root}/data"
  chmod 0664 "${runtime_root}/data/announcement.txt"

  nohup runuser -u www-data -- \
    env SITE_NOTICE_PATH="${runtime_root}/data/announcement.txt" \
    php -S 0.0.0.0:8137 -t "${runtime_root}/public" \
    >"${runtime_root}/server.log" 2>&1 &
  printf '%s\n' "$!" > "${runtime_root}/server.pid"

  for _ in {1..30}; do
    if curl --fail --silent --max-time 1 http://127.0.0.1:8137/ >/dev/null; then
      printf 'Dev server ready at http://127.0.0.1:8137/\n'
      return
    fi
    sleep 0.2
  done

  cat "${runtime_root}/server.log" >&2
  exit 1
}

case "${1:-}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  *)
    printf 'Usage: %s {start|stop}\n' "$0" >&2
    exit 1
    ;;
esac
