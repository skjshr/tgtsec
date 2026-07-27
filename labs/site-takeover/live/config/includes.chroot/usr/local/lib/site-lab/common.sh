#!/usr/bin/env bash

readonly SITE_LAB_STATE_FILE="/run/site-takeover-mode"
readonly SITE_LAB_INTERFACE_FILE="/run/site-lab-interface"
readonly SITE_LAB_CODEX_RUNTIME="/run/site-lab-codex"
readonly SITE_LAB_SOURCE="/usr/local/share/site-takeover-source"

site_lab_state() {
  if [[ -r "${SITE_LAB_STATE_FILE}" ]]; then
    cat "${SITE_LAB_STATE_FILE}"
  else
    printf 'guarded\n'
  fi
}

site_lab_set_state() {
  local state="$1"
  printf '%s\n' "${state}" > "${SITE_LAB_STATE_FILE}"
  chmod 0644 "${SITE_LAB_STATE_FILE}"
}

site_lab_write_issue() {
  local title="$1"
  shift
  {
    printf '\nSITE TAKEOVER LAB\n'
    printf 'STATE: %s\n\n' "${title}"
    printf '%s\n' "$@"
    printf '\nStatus command: lab-console\n\n'
  } > /etc/issue
}

site_lab_physical_disks() {
  lsblk -dn -e 1,7,11 -o NAME,TYPE,RO,TRAN,SIZE,MODEL |
    awk '$2 == "disk" { print }'
}

site_lab_usb_disks() {
  lsblk -dn -e 1,7,11 -o NAME,TYPE,TRAN |
    awk '$2 == "disk" && $3 == "usb" { print $1 }'
}

site_lab_assert_no_physical_disks() {
  local disks
  disks="$(site_lab_physical_disks)"
  if [[ -n "${disks}" ]]; then
    printf 'Physical disk access is blocked. Visible disk(s):\n%s\n' "${disks}" >&2
    return 1
  fi
}

site_lab_assert_live_ram() {
  grep -qw toram /proc/cmdline ||
    {
      printf 'The Live system was not started with toram.\n' >&2
      return 1
    }
  grep -qw nopersistence /proc/cmdline ||
    {
      printf 'The Live system was not started with nopersistence.\n' >&2
      return 1
    }
  findmnt -n -o FSTYPE / | grep -Eq '^(overlay|overlayfs)$' ||
    {
      printf 'The root filesystem is not a Live overlay.\n' >&2
      return 1
    }
}

site_lab_assert_live_media_in_ram() {
  local source filesystem

  mountpoint -q /run/live/medium ||
    {
      printf 'The Live medium mount is missing.\n' >&2
      return 1
    }

  source="$(findmnt -n -o SOURCE --target /run/live/medium)"
  filesystem="$(findmnt -n -o FSTYPE --target /run/live/medium)"
  if [[ "${source}" != "tmpfs" || "${filesystem}" != "tmpfs" ]]; then
    printf 'The Live medium is not RAM-backed (source=%s, fstype=%s).\n' \
      "${source:-unknown}" "${filesystem:-unknown}" >&2
    return 1
  fi
}

site_lab_find_ethernet_with_carrier() {
  local path name
  for path in /sys/class/net/*; do
    name="${path##*/}"
    [[ "${name}" != "lo" ]] || continue
    [[ -e "${path}/device" ]] || continue
    [[ ! -d "${path}/wireless" ]] || continue
    [[ "$(<"${path}/type")" == "1" ]] || continue
    [[ -r "${path}/carrier" && "$(<"${path}/carrier")" == "1" ]] || continue
    printf '%s\n' "${name}"
    return 0
  done
  return 1
}

site_lab_lock_network() {
  local device state

  systemctl stop site-lab-dhcp.service apache2.service >/dev/null 2>&1 || true
  nmcli radio wifi off >/dev/null 2>&1 || true

  while IFS=: read -r device state; do
    if [[ -n "${device}" && "${device}" != "lo" && "${state}" == "connected" ]]; then
      nmcli device disconnect "${device}" >/dev/null 2>&1 || true
    fi
  done < <(LC_ALL=C nmcli -t -f DEVICE,STATE device status)

  cat > /run/site-lab-guard.nft <<'EOF'
flush ruleset
table inet site_guard {
  chain input {
    type filter hook input priority 0; policy drop;
    iifname "lo" accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
  }
  chain output {
    type filter hook output priority 0; policy drop;
    oifname "lo" accept
  }
}
EOF
  nft -f /run/site-lab-guard.nft
}

site_lab_terminate_process_group() {
  local pgid="$1"

  [[ "${pgid}" =~ ^[0-9]+$ && "${pgid}" -gt 1 ]] || return 0
  kill -TERM -- "-${pgid}" >/dev/null 2>&1 || return 0

  for _ in {1..20}; do
    kill -0 -- "-${pgid}" >/dev/null 2>&1 || return 0
    sleep 0.1
  done

  kill -KILL -- "-${pgid}" >/dev/null 2>&1 || true
}

site_lab_stop_codex() {
  local pgid_file pgid
  if [[ -d "${SITE_LAB_CODEX_RUNTIME}" ]]; then
    while IFS= read -r -d '' pgid_file; do
      pgid="$(<"${pgid_file}")"
      site_lab_terminate_process_group "${pgid}"
    done < <(find "${SITE_LAB_CODEX_RUNTIME}" -name pgid -type f -print0 2>/dev/null)
  fi
  rm -rf -- "${SITE_LAB_CODEX_RUNTIME}"
}
