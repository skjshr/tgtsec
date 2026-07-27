#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly LAB_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly REPO_ROOT="$(cd -- "${LAB_ROOT}/../.." && pwd)"
readonly DIST_DIR="${SCRIPT_DIR}/dist"
readonly OUTPUT_ISO="${DIST_DIR}/site-takeover-live-amd64.iso"
readonly OUTPUT_CHECKSUM="${OUTPUT_ISO}.sha256"
readonly OUTPUT_BOOT_REPORT="${DIST_DIR}/site-takeover-live-amd64.boot.txt"
readonly OUTPUT_BUILD_LOG="${DIST_DIR}/build.log"
readonly WORK_PARENT="${LIVE_BUILD_WORK_PARENT:-/var/tmp}"
readonly MINIMUM_FREE_BYTES=10737418240

work_root=""

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

repo_git() {
  git -c safe.directory="${REPO_ROOT}" -C "${REPO_ROOT}" "$@"
}

cleanup() {
  if [[ -n "${work_root}" && -d "${work_root}" ]]; then
    (
      cd "${work_root}"
      lb clean --purge >/dev/null 2>&1 || true
    )
    cd /
    rm -rf -- "${work_root}"
  fi
}

trap cleanup EXIT

[[ "${EUID}" -eq 0 ]] || die "Run with sudo on Debian 13."
[[ -r /etc/os-release ]] || die "Cannot identify the build system."

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "debian" && "${VERSION_ID:-}" == 13* ]] ||
  die "Build on Debian 13; found ${PRETTY_NAME:-unknown}."

for command_name in git lb rsync sha256sum wget xorriso; do
  command -v "${command_name}" >/dev/null 2>&1 ||
    die "Missing build command: ${command_name}"
done

[[ "${WORK_PARENT}" == /* && -d "${WORK_PARENT}" && -w "${WORK_PARENT}" ]] ||
  die "LIVE_BUILD_WORK_PARENT must be an existing writable absolute directory."

available_bytes="$(df -B1 --output=avail "${WORK_PARENT}" | tail -n 1 | tr -d '[:space:]')"
[[ "${available_bytes}" =~ ^[0-9]+$ ]] ||
  die "Could not determine free space under ${WORK_PARENT}."
((available_bytes >= MINIMUM_FREE_BYTES)) ||
  die "Live build needs at least 10 GiB free under ${WORK_PARENT}; found ${available_bytes} bytes."

for required_path in \
  "${LAB_ROOT}/target/site/index.php" \
  "${LAB_ROOT}/guide/index.html" \
  "${SCRIPT_DIR}/config/package-lists/site-takeover.list.chroot" \
  "${SCRIPT_DIR}/config/includes.chroot/usr/local/sbin/lab-guard"; do
  [[ -e "${required_path}" ]] || die "Missing build input: ${required_path}"
done

work_root="$(mktemp -d "${WORK_PARENT%/}/site-takeover-live-build.XXXXXX")"
install -d -m 0755 "${DIST_DIR}"
rm -f -- \
  "${OUTPUT_ISO}" \
  "${OUTPUT_CHECKSUM}" \
  "${OUTPUT_BOOT_REPORT}" \
  "${OUTPUT_BUILD_LOG}"

cd "${work_root}"
lb config noauto \
  --clean \
  --ignore-system-defaults \
  --mode debian \
  --system live \
  --distribution trixie \
  --architecture amd64 \
  --binary-image iso-hybrid \
  --bootloaders "syslinux grub-efi" \
  --uefi-secure-boot enable \
  --archive-areas "main non-free-firmware" \
  --debian-installer none \
  --firmware-chroot true \
  --apt-indices false \
  --apt-source-archives false \
  --apt-recommends true \
  --debootstrap-options "--variant=minbase" \
  --source false \
  --cache false \
  --memtest none \
  --win32-loader false \
  --checksums sha256 \
  --chroot-squashfs-compression-type xz \
  --utc-time true \
  --image-name site-takeover-live \
  --iso-application "Site Takeover Lab" \
  --iso-publisher "skjshr/tgtsec" \
  --iso-volume "SITE_TAKEOVER_LIVE" \
  --bootappend-live "boot=live components toram nopersistence noeject ip=frommedia overlay-size=1024m username=lab hostname=site-target locales=ja_JP.UTF-8 keyboard-layouts=jp timezone=Asia/Tokyo" \
  --bootappend-live-failsafe none

rsync -a "${SCRIPT_DIR}/config/" "${work_root}/config/"

readonly source_root="${work_root}/config/includes.chroot/usr/local/share/site-takeover-source"
install -d -m 0755 \
  "${source_root}/public" \
  "${source_root}/guide" \
  "${source_root}/private"
rsync -a --delete "${LAB_ROOT}/target/site/" "${source_root}/public/"
rsync -a --delete "${LAB_ROOT}/guide/" "${source_root}/guide/"
install -m 0644 "${SCRIPT_DIR}/assets/manager-note.txt" "${source_root}/private/manager-note.txt"
install -m 0600 "${SCRIPT_DIR}/assets/root-proof.txt" "${source_root}/root-proof.txt"

source_commit="$(repo_git rev-parse HEAD)"
source_branch="$(repo_git branch --show-current)"
source_dirty="false"
if [[ -n "$(repo_git status --porcelain)" ]]; then
  source_dirty="true"
fi

cat > "${work_root}/config/includes.chroot/usr/local/share/site-takeover-build.txt" <<EOF
branch=${source_branch}
commit=${source_commit}
dirty=${source_dirty}
EOF

export SOURCE_DATE_EPOCH
SOURCE_DATE_EPOCH="$(repo_git show -s --format=%ct HEAD)"

lb build 2>&1 | tee "${OUTPUT_BUILD_LOG}"

mapfile -t built_isos < <(find "${work_root}" -maxdepth 1 -type f -name '*.hybrid.iso' -print)
[[ "${#built_isos[@]}" -eq 1 ]] ||
  die "Expected exactly one hybrid ISO; found ${#built_isos[@]}."
built_iso="${built_isos[0]}"

iso_size="$(stat -c %s "${built_iso}")"
((iso_size < 1932735283)) ||
  die "ISO exceeds the 1.8 GiB release gate: ${iso_size} bytes"

xorriso -indev "${built_iso}" -report_el_torito plain \
  > "${OUTPUT_BOOT_REPORT}" 2>&1
grep -Fq 'BIOS' "${OUTPUT_BOOT_REPORT}" ||
  die "ISO does not report a BIOS boot entry."
grep -Fq 'UEFI' "${OUTPUT_BOOT_REPORT}" ||
  die "ISO does not report a UEFI boot entry."

install -m 0644 "${built_iso}" "${OUTPUT_ISO}"
(
  cd "${DIST_DIR}"
  sha256sum "$(basename "${OUTPUT_ISO}")" \
    > "$(basename "${OUTPUT_CHECKSUM}")"
)

printf 'Built %s (%s bytes)\n' "${OUTPUT_ISO}" "${iso_size}"
cat "${OUTPUT_CHECKSUM}"
