from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Callable

from .model import (
    ContractError,
    load_json,
    sha256_file,
    validate_exact_disk_identity,
    validate_exact_identity,
    validate_profile,
)


@dataclass(frozen=True)
class RecoveryRequest:
    operation: str
    disk_by_id: str
    debian_partuuid: str
    esp_partuuid: str
    image_sha256: str
    efi_sha256: str | None
    confirmation: str


@dataclass(frozen=True)
class RecoveryContext:
    recovery_mount: Path
    marker_path: Path
    image_path: Path
    efi_archive_path: Path | None
    target_disk_device: str
    debian_device: str | None
    esp_device: str | None


def _require_under(path: Path, parent: Path, label: str) -> Path:
    try:
        resolved_parent = parent.resolve(strict=True)
        if path.is_symlink():
            raise ContractError(f"{label} must not be a symlink")
        resolved = path.resolve(strict=True)
        resolved.relative_to(resolved_parent)
    except (OSError, ValueError) as exc:
        raise ContractError(f"{label} must exist inside trusted recovery media") from exc
    return resolved


def _partition_device(inventory: dict[str, Any], label: str) -> str:
    partition = inventory.get("partitions", {}).get(label)
    if not isinstance(partition, dict):
        raise ContractError(f"inventory partition {label} is missing")
    device = partition.get("device")
    if not isinstance(device, str) or not device.startswith("/dev/"):
        raise ContractError(f"inventory partition {label} has no exact /dev path")
    mountpoints = partition.get("mountpoints")
    if mountpoints not in (None, [], [None]):
        raise ContractError(f"target partition {label} must be unmounted")
    return device


def _validate_marker(
    profile: dict[str, Any], inventory: dict[str, Any], marker_path: Path
) -> None:
    marker = load_json(marker_path)
    expected_recovery = profile["recovery"]
    if marker.get("schemaVersion") != 1:
        raise ContractError("trusted marker schemaVersion must be 1")
    if marker.get("trustedPurpose") != "examserver-open-world-recovery":
        raise ContractError("trusted marker purpose is invalid")
    for key in ("kitId", "mediaUuid"):
        if marker.get(key) != expected_recovery.get(key):
            raise ContractError(f"trusted marker {key} does not match profile")
    if marker.get("goldenDebianFilesystemUuid") != expected_recovery[
        "goldenBtrfsStream"
    ]["filesystemUuid"]:
        raise ContractError(
            "trusted marker golden Debian filesystem UUID does not match profile"
        )
    observed_media = inventory.get("recoveryMedia")
    if not isinstance(observed_media, dict):
        raise ContractError("recovery media was not identified by inventory")
    if observed_media.get("mediaUuid") != expected_recovery["mediaUuid"]:
        raise ContractError("mounted recovery media UUID does not match profile")
    if observed_media.get("removable") is not True:
        raise ContractError("mounted recovery media is not removable")


def _expected_confirmation(profile: dict[str, Any], operation: str) -> str:
    disk_by_id = profile["target"]["diskById"]
    if operation == "normal":
        return f"RESTORE DEBIAN {disk_by_id}"
    if operation == "full":
        return f"RESTORE FULL DISK {disk_by_id}"
    raise ContractError(f"unsupported recovery operation: {operation}")


def validate_recovery_request(
    profile: dict[str, Any],
    inventory: dict[str, Any],
    request: RecoveryRequest,
    *,
    recovery_mount: Path,
    marker_path: Path,
) -> RecoveryContext:
    validate_profile(profile)
    if inventory.get("bootEnvironment") != "trusted-recovery-media":
        raise ContractError(
            "recovery may run only while booted from trusted recovery media"
        )
    boot_evidence = inventory.get("bootEvidence")
    if not isinstance(boot_evidence, dict):
        raise ContractError("independent recovery boot evidence is missing")
    if boot_evidence.get("kernelRecoveryToken") is not True:
        raise ContractError("trusted recovery kernel token was not observed")
    if boot_evidence.get("recoverySourceRemovable") is not True:
        raise ContractError("recovery source is not independently removable")
    if boot_evidence.get("rootSourceRemovable") is not True:
        raise ContractError("recovery operating-system root is not removable")
    if boot_evidence.get("rootSourceHasBlockTopology") is not True:
        raise ContractError("recovery operating-system root topology is empty")
    if boot_evidence.get("rootSourceNotTarget") is not True:
        raise ContractError("recovery operating-system root resolves to target")
    if boot_evidence.get("rootSharesRecoveryMedia") is not True:
        raise ContractError(
            "recovery operating-system root does not share the recovery USB"
        )
    root_backing_devices = boot_evidence.get("rootBackingDevices")
    root_physical_disks = boot_evidence.get("rootPhysicalDisks")
    target_source = inventory.get("targetDisk", {}).get("resolvedDevice")
    if not isinstance(root_backing_devices, list) or not root_backing_devices:
        raise ContractError("recovery root block topology is missing")
    if not isinstance(root_physical_disks, list) or not root_physical_disks:
        raise ContractError("recovery root physical disk is missing")
    if (
        not isinstance(target_source, str)
        or target_source in root_backing_devices
    ):
        raise ContractError("recovery system root is backed by the target disk")
    identity_errors = (
        validate_exact_identity(profile, inventory)
        if request.operation == "normal"
        else validate_exact_disk_identity(profile, inventory)
    )
    if identity_errors:
        raise ContractError("; ".join(identity_errors))
    if request.operation == "full":
        descendant_mountpoints = inventory.get("targetDisk", {}).get(
            "descendantMountpoints"
        )
        if descendant_mountpoints != []:
            raise ContractError(
                "full recovery requires every target-disk descendant "
                "to be unmounted"
            )

    expected_target = profile["target"]
    supplied = {
        "diskById": request.disk_by_id,
        "debianPartuuid": request.debian_partuuid,
        "espPartuuid": request.esp_partuuid,
    }
    for key, value in supplied.items():
        if value != expected_target[key]:
            raise ContractError(f"supplied {key} does not exactly match profile")
    expected_phrase = _expected_confirmation(profile, request.operation)
    if request.confirmation != expected_phrase:
        raise ContractError(f"confirmation must exactly equal: {expected_phrase}")

    observed_mount = inventory["recoveryMedia"].get("mountPoint")
    resolved_mount = recovery_mount.resolve(strict=True)
    if observed_mount != str(resolved_mount):
        raise ContractError("recovery mount path does not match live inventory")
    media_source = inventory["recoveryMedia"].get("sourceDevice")
    if not isinstance(media_source, str) or not media_source.startswith("/dev/"):
        raise ContractError("recovery media source device is not known")
    if media_source == target_source or media_source.startswith(str(target_source)):
        raise ContractError("recovery media resolves to the target disk")
    backing_devices = inventory["recoveryMedia"].get("backingDevices")
    if (
        not isinstance(backing_devices, list)
        or not backing_devices
        or target_source in backing_devices
    ):
        raise ContractError("recovery media is backed by the target disk")
    media_physical_disks = inventory["recoveryMedia"].get("physicalDisks")
    if (
        not isinstance(media_physical_disks, list)
        or not media_physical_disks
        or not set(root_physical_disks) & set(media_physical_disks)
        or boot_evidence.get("rootTransport") != "usb"
        or inventory["recoveryMedia"].get("transport") != "usb"
    ):
        raise ContractError(
            "recovery root and assets are not on the same physical USB"
        )
    resolved_marker = _require_under(marker_path, resolved_mount, "trusted marker")
    _validate_marker(profile, inventory, resolved_marker)

    recovery = profile["recovery"]
    if request.operation == "normal":
        asset = recovery["goldenBtrfsStream"]
        efi_asset = recovery["debianEfiArchive"]
        if request.image_sha256.lower() != asset["sha256"].lower():
            raise ContractError("supplied golden stream hash does not match profile")
        if request.efi_sha256 is None or (
            request.efi_sha256.lower() != efi_asset["sha256"].lower()
        ):
            raise ContractError("supplied Debian EFI hash does not match profile")
        image_path = _require_under(
            resolved_mount / asset["path"], resolved_mount, "golden Btrfs stream"
        )
        efi_path = _require_under(
            resolved_mount / efi_asset["path"], resolved_mount, "Debian EFI archive"
        )
        if sha256_file(image_path) != request.image_sha256.lower():
            raise ContractError("golden Btrfs stream content hash mismatch")
        if sha256_file(efi_path) != request.efi_sha256.lower():
            raise ContractError("Debian EFI archive content hash mismatch")
    elif request.operation == "full":
        asset = recovery["bareMetalImage"]
        if request.image_sha256.lower() != asset["sha256"].lower():
            raise ContractError("supplied full-image hash does not match profile")
        image_path = _require_under(
            resolved_mount / asset["path"], resolved_mount, "bare-metal image"
        )
        if sha256_file(image_path) != request.image_sha256.lower():
            raise ContractError("bare-metal image content hash mismatch")
        image_size = image_path.stat().st_size
        expected_size = profile["target"]["diskSizeBytes"]
        if image_size != expected_size:
            raise ContractError(
                "bare-metal image logical size must exactly match target disk: "
                f"expected {expected_size}, observed {image_size}"
            )
        efi_path = None
    else:
        raise ContractError(f"unsupported recovery operation: {request.operation}")

    target_disk = inventory["targetDisk"].get("resolvedDevice")
    if not isinstance(target_disk, str) or not target_disk.startswith("/dev/"):
        raise ContractError("inventory has no exact resolved target disk device")
    return RecoveryContext(
        recovery_mount=resolved_mount,
        marker_path=resolved_marker,
        image_path=image_path,
        efi_archive_path=efi_path,
        target_disk_device=target_disk,
        debian_device=(
            _partition_device(inventory, "debian")
            if request.operation == "normal"
            else None
        ),
        esp_device=(
            _partition_device(inventory, "esp")
            if request.operation == "normal"
            else None
        ),
    )


def recovery_plan(
    profile: dict[str, Any],
    request: RecoveryRequest,
    context: RecoveryContext,
) -> dict[str, Any]:
    if request.operation == "normal":
        if context.debian_device is None or context.esp_device is None:
            raise ContractError(
                "normal recovery requires exact Debian and ESP partitions"
            )
        actions = [
            {
                "action": "format-btrfs-with-golden-uuid",
                "target": context.debian_device,
                "filesystemUuid": profile["recovery"][
                    "goldenBtrfsStream"
                ]["filesystemUuid"],
                "verifyReadback": True,
                "preserves": ["partition-table", "ESP"],
            },
            {
                "action": "receive-golden-subvolume",
                "source": str(context.image_path),
                "expectedSubvolume": "@",
            },
            {
                "action": "make-received-root-writable",
                "target": "@",
                "expectedProperty": "ro=false",
            },
            {
                "action": "verify-stable-root-boot-contract",
                "allowedRootIdentifiers": [
                    f"PARTUUID={request.debian_partuuid}",
                    "LABEL=open-world-lab",
                ],
                "forbiddenRootIdentifier": "UUID",
            },
            {
                "action": "replace-debian-efi-only",
                "source": str(context.efi_archive_path),
                "target": f"{context.esp_device}:EFI/debian",
            },
        ]
    else:
        actions = [
            {
                "action": "write-full-disk-image",
                "source": str(context.image_path),
                "target": context.target_disk_device,
                "expectedBytes": profile["target"]["diskSizeBytes"],
                "validatedImageBytes": context.image_path.stat().st_size,
                "overwrites": ["Debian", "ESP", "partition-table"],
            }
        ]
    return {
        "applied": False,
        "operation": request.operation,
        "diskById": request.disk_by_id,
        "actions": actions,
        "physicalVerificationRequired": [
            "target boots Debian exercise mode",
            "all 13 optional flags and session residue are back at golden state",
        ],
    }


def tree_sha256(root: Path) -> str:
    if not root.is_dir() or root.is_symlink():
        raise ContractError(f"EFI tree is missing or unsafe: {root}")
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ContractError(f"EFI tree contains a symlink: {path}")
        relative = path.relative_to(root).as_posix().encode("utf-8")
        if path.is_dir():
            digest.update(b"D\0" + relative + b"\0")
        elif path.is_file():
            digest.update(b"F\0" + relative + b"\0")
            with path.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
        else:
            raise ContractError(f"EFI tree contains a special file: {path}")
    return digest.hexdigest()


def _validated_efi_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    if not members:
        raise ContractError("Debian EFI archive is empty")
    validated: list[tarfile.TarInfo] = []
    for member in members:
        relative = PurePosixPath(member.name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ContractError(f"unsafe EFI archive path: {member.name}")
        if relative.parts[:2] != ("EFI", "debian"):
            raise ContractError(
                f"EFI archive may contain only EFI/debian: {member.name}"
            )
        if member.issym() or member.islnk() or member.isdev():
            raise ContractError(f"EFI archive contains a link/device: {member.name}")
        if not (member.isdir() or member.isfile()):
            raise ContractError(f"EFI archive contains unsupported entry: {member.name}")
        validated.append(member)
    return validated


def _extract_debian_efi(archive_path: Path, esp_mount: Path) -> None:
    debian_root = esp_mount / "EFI" / "debian"
    resolved_esp = esp_mount.resolve(strict=True)
    if debian_root.exists():
        if debian_root.is_symlink():
            raise ContractError("existing EFI/debian is a symlink")
        resolved_debian = debian_root.resolve(strict=True)
        try:
            resolved_debian.relative_to(resolved_esp)
        except ValueError as exc:
            raise ContractError("existing EFI/debian escapes the mounted ESP") from exc
        shutil.rmtree(resolved_debian)
    with tarfile.open(archive_path, "r:*") as archive:
        members = _validated_efi_members(archive)
        for member in members:
            destination = esp_mount.joinpath(*PurePosixPath(member.name).parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            source = archive.extractfile(member)
            if source is None:
                raise ContractError(f"cannot read archive member: {member.name}")
            with source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)
            os.chmod(destination, member.mode & 0o755)


def _run(
    args: list[str],
    *,
    stdin: BinaryIO | None = None,
    runner: Callable[..., subprocess.CompletedProcess[bytes]] = subprocess.run,
) -> subprocess.CompletedProcess[bytes]:
    completed = runner(
        args,
        stdin=stdin,
        check=False,
        capture_output=True,
        timeout=None,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ContractError(f"recovery command failed: {args!r}: {stderr}")
    return completed


def btrfs_format_command(device: str, filesystem_uuid: str) -> list[str]:
    return [
        "mkfs.btrfs",
        "--force",
        "--label",
        "open-world-lab",
        "--uuid",
        filesystem_uuid,
        device,
    ]


def verify_filesystem_uuid(
    device: str,
    expected_uuid: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[bytes]] = subprocess.run,
) -> None:
    completed = _run(
        [
            "blkid",
            "--probe",
            "--output",
            "value",
            "--match-tag",
            "UUID",
            device,
        ],
        runner=runner,
    )
    observed = completed.stdout.decode(
        "utf-8", errors="replace"
    ).strip()
    if observed.lower() != expected_uuid.lower():
        raise ContractError(
            "formatted Debian filesystem UUID does not match the golden "
            f"boot identity: expected {expected_uuid}, observed {observed!r}"
        )


def validate_restored_boot_contract(
    restored_root: Path, debian_partuuid: str
) -> None:
    if restored_root.is_symlink() or not restored_root.is_dir():
        raise ContractError("restored @ root is missing or unsafe")
    fstab = restored_root / "etc/fstab"
    grub = restored_root / "boot/grub/grub.cfg"
    if (
        not fstab.is_file()
        or fstab.is_symlink()
        or not grub.is_file()
        or grub.is_symlink()
    ):
        raise ContractError("restored root lacks trusted fstab or generated grub.cfg")
    allowed = {
        f"PARTUUID={debian_partuuid}",
        "LABEL=open-world-lab",
    }
    root_entries: list[list[str]] = []
    for line in fstab.read_text(encoding="utf-8").splitlines():
        content = line.split("#", 1)[0].strip()
        if not content:
            continue
        fields = content.split()
        if len(fields) >= 4 and fields[1] == "/":
            root_entries.append(fields)
    if len(root_entries) != 1:
        raise ContractError("restored fstab must contain exactly one / entry")
    source, _, filesystem_type, options = root_entries[0][:4]
    if source not in allowed:
        raise ContractError("restored fstab root is not stable across mkfs")
    if filesystem_type != "btrfs" or "subvol=@" not in options.split(","):
        raise ContractError("restored fstab root must mount the btrfs @ subvolume")

    grub_text = grub.read_text(encoding="utf-8")
    if re.search(r"(?:^|\s)root=UUID=", grub_text):
        raise ContractError("generated grub.cfg still depends on filesystem UUID")
    allowed_pattern = "|".join(re.escape(value) for value in sorted(allowed))
    if not re.search(rf"(?:^|\s)root=(?:{allowed_pattern})(?:\s|$)", grub_text):
        raise ContractError("generated grub.cfg has no stable root identifier")


def validate_received_subvolume(btrfs_mount: Path) -> Path:
    expected_root = btrfs_mount / "@"
    received_entries = sorted(path.name for path in btrfs_mount.iterdir())
    if (
        received_entries != ["@"]
        or not expected_root.is_dir()
        or expected_root.is_symlink()
    ):
        raise ContractError(
            "golden stream must create exactly one top-level @ subvolume"
        )
    return expected_root


def make_received_root_writable(
    restored_root: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[bytes]] = subprocess.run,
) -> None:
    _run(
        ["btrfs", "property", "set", str(restored_root), "ro", "false"],
        runner=runner,
    )
    completed = _run(
        ["btrfs", "property", "get", str(restored_root), "ro"],
        runner=runner,
    )
    observed = completed.stdout.decode("utf-8", errors="replace").strip()
    if observed != "ro=false":
        raise ContractError(
            f"received @ subvolume remained read-only: {observed!r}"
        )


def _require_recovery_authority() -> None:
    if os.name != "posix" or os.geteuid() != 0:
        raise ContractError("recovery mutation requires root on trusted Linux media")


def apply_recovery(
    profile: dict[str, Any],
    request: RecoveryRequest,
    context: RecoveryContext,
    *,
    runner: Callable[..., subprocess.CompletedProcess[bytes]] = subprocess.run,
) -> dict[str, Any]:
    _require_recovery_authority()
    if request.operation == "full":
        _run(
            [
                "dd",
                f"if={context.image_path}",
                f"of={context.target_disk_device}",
                "bs=16M",
                "iflag=fullblock",
                "conv=fsync",
                "status=progress",
            ],
            runner=runner,
        )
        return {
            "applied": True,
            "operation": "full",
            "physicalVerificationRequired": True,
        }

    if context.efi_archive_path is None:
        raise ContractError("normal recovery requires the Debian EFI archive")
    if context.debian_device is None or context.esp_device is None:
        raise ContractError(
            "normal recovery requires exact Debian and ESP partitions"
        )
    mount_root = Path("/run/open-world-recovery")
    mount_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="restore-", dir=mount_root))
    btrfs_mount = temporary / "btrfs"
    esp_mount = temporary / "esp"
    btrfs_mount.mkdir(mode=0o700)
    esp_mount.mkdir(mode=0o700)
    btrfs_mounted = False
    esp_mounted = False
    try:
        golden_filesystem_uuid = profile["recovery"][
            "goldenBtrfsStream"
        ]["filesystemUuid"]
        _run(
            btrfs_format_command(
                context.debian_device, golden_filesystem_uuid
            ),
            runner=runner,
        )
        verify_filesystem_uuid(
            context.debian_device,
            golden_filesystem_uuid,
            runner=runner,
        )
        _run(["mount", context.debian_device, str(btrfs_mount)], runner=runner)
        btrfs_mounted = True
        with context.image_path.open("rb") as stream:
            _run(["btrfs", "receive", str(btrfs_mount)], stdin=stream, runner=runner)
        expected_root = validate_received_subvolume(btrfs_mount)
        make_received_root_writable(expected_root, runner=runner)
        validate_restored_boot_contract(
            expected_root, request.debian_partuuid
        )
        _run(["umount", str(btrfs_mount)], runner=runner)
        btrfs_mounted = False

        _run(["mount", context.esp_device, str(esp_mount)], runner=runner)
        esp_mounted = True
        _extract_debian_efi(context.efi_archive_path, esp_mount)
        _run(["sync"], runner=runner)
        _run(["umount", str(esp_mount)], runner=runner)
        esp_mounted = False
    finally:
        cleanup_errors: list[str] = []
        if esp_mounted:
            try:
                _run(["umount", str(esp_mount)], runner=runner)
            except ContractError as exc:
                cleanup_errors.append(str(exc))
        if btrfs_mounted:
            try:
                _run(["umount", str(btrfs_mount)], runner=runner)
            except ContractError as exc:
                cleanup_errors.append(str(exc))
        if os.path.ismount(esp_mount) or os.path.ismount(btrfs_mount):
            cleanup_errors.append(
                f"recovery mount remains active under {temporary}; left in place"
            )
        else:
            try:
                esp_mount.rmdir()
                btrfs_mount.rmdir()
                temporary.rmdir()
            except OSError as exc:
                cleanup_errors.append(
                    f"safe empty-directory cleanup failed under {temporary}: {exc}"
                )
        if cleanup_errors:
            raise ContractError("; ".join(cleanup_errors))
    return {
        "applied": True,
        "operation": "normal",
        "debianFilesystemUuidPreserved": True,
        "physicalVerificationRequired": True,
    }
