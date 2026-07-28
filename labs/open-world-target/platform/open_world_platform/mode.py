from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .model import (
    ALWAYS_MASKED_UNITS,
    ContractError,
    INTERFACE_RE,
    RAW_AUDIT_UNITS,
    TRANSIENT_LAB_UNITS,
    WINDOWS_MOUNT_UNIT,
)
from .preflight import (
    evaluate_connectivity_clean_state,
    evaluate_exercise,
    evaluate_host_binding,
    evaluate_maintenance,
)
from .session import prepare_fresh_session


RUNTIME_DIR = Path("/run/open-world-lab")
EXERCISE_MARKER = RUNTIME_DIR / "exercise-ready"
TELEMETRY_SOCKET = "open-world-telemetry.socket"


@dataclass(frozen=True)
class PlannedCommand:
    args: tuple[str, ...]
    purpose: str

    def to_dict(self) -> dict[str, Any]:
        return {"args": list(self.args), "purpose": self.purpose}


def _service_names(manifest: dict[str, Any]) -> list[str]:
    services = manifest["services"]
    return sorted(
        set(
            services["vulnerable"]
            + services["exerciseInfrastructure"]
            + [
                TELEMETRY_SOCKET,
                WINDOWS_MOUNT_UNIT,
                *ALWAYS_MASKED_UNITS,
                *TRANSIENT_LAB_UNITS,
            ]
        )
    )


def _stop_lab_commands(manifest: dict[str, Any]) -> list[PlannedCommand]:
    names = [
        name for name in _service_names(manifest)
        if name not in RAW_AUDIT_UNITS
    ]
    return [
        PlannedCommand(
            ("systemctl", "stop", *names),
            "stop every lab-facing service during the transition",
        ),
    ]


def _safe_observed_interfaces(inventory: dict[str, Any]) -> list[str]:
    values = []
    network = inventory.get("network", {})
    for interface in network.get("interfaces", []):
        if not isinstance(interface, dict):
            continue
        name = interface.get("name")
        if (
            isinstance(name, str)
            and name != "lo"
            and INTERFACE_RE.fullmatch(name)
        ):
            values.append(name)
    return sorted(set(values))


def exercise_plan(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> list[PlannedCommand]:
    wired = profile["network"]["wiredInterface"]
    if not INTERFACE_RE.fullmatch(wired):
        raise ContractError("unsafe wired interface name")
    commands = [
        PlannedCommand(
            ("systemctl", "stop", "open-world-exercise.target"),
            "close the exercise target before changing isolation",
        ),
        *_stop_lab_commands(manifest),
        PlannedCommand(
            (
                "systemctl",
                "stop",
                *manifest["services"]["maintenanceConnectivity"],
            ),
            "stop update connectivity before vulnerable services can return",
        ),
        PlannedCommand(("rfkill", "block", "wifi"), "block Wi-Fi"),
        PlannedCommand(("rfkill", "block", "wwan"), "block mobile broadband"),
        PlannedCommand(("rfkill", "block", "bluetooth"), "block Bluetooth"),
    ]
    for interface in _safe_observed_interfaces(inventory):
        if interface != wired:
            commands.append(
                PlannedCommand(
                    ("ip", "link", "set", "dev", interface, "down"),
                    f"disable non-lab interface {interface}",
                )
            )
    commands.extend(
        [
            PlannedCommand(
                ("ip", "link", "set", "dev", wired, "down"),
                "close the wired link while replacing its state",
            ),
            PlannedCommand(
                ("ip", "address", "flush", "dev", wired),
                "remove stale addresses from the wired link",
            ),
            PlannedCommand(
                ("ip", "route", "flush", "dev", wired),
                "remove every IPv4 route on the wired link",
            ),
            PlannedCommand(
                ("ip", "-6", "route", "flush", "dev", wired),
                "remove every IPv6 route on the wired link",
            ),
            PlannedCommand(
                (
                    "ip",
                    "address",
                    "add",
                    manifest["network"]["targetAddress"],
                    "dev",
                    wired,
                ),
                "assign the one exercise address",
            ),
            PlannedCommand(
                ("ip", "link", "set", "dev", wired, "up"),
                "raise only the direct-link interface",
            ),
            PlannedCommand(
                ("sysctl", "--system"),
                "disable forwarding and IPv6 using the installed policy",
            ),
            PlannedCommand(
                (
                    "nft",
                    "--file",
                    "/etc/nftables.d/open-world-exercise.nft",
                ),
                "install the subnet-only exercise firewall",
            ),
        ]
    )
    return commands


def maintenance_plan(
    manifest: dict[str, Any],
    profile: dict[str, Any],
) -> list[PlannedCommand]:
    wired = profile["network"]["wiredInterface"]
    return [
        PlannedCommand(
            ("systemctl", "stop", "open-world-exercise.target"),
            "stop the aggregate exercise target first",
        ),
        *_stop_lab_commands(manifest),
        PlannedCommand(
            (
                "systemctl",
                "stop",
                *manifest["services"]["maintenanceConnectivity"],
            ),
            "stop all maintenance connectivity before quarantine verification",
        ),
        PlannedCommand(
            (
                "nft",
                "--file",
                "/etc/nftables.d/open-world-quarantine.nft",
            ),
            "deny non-loopback traffic before any maintenance connectivity",
        ),
        PlannedCommand(
            ("ip", "link", "set", "dev", wired, "down"),
            "close the exercise cable interface",
        ),
        PlannedCommand(
            ("ip", "address", "flush", "dev", wired),
            "remove the exercise address",
        ),
        PlannedCommand(
            ("ip", "route", "flush", "dev", wired),
            "remove exercise IPv4 routes",
        ),
        PlannedCommand(
            ("ip", "-6", "route", "flush", "dev", wired),
            "remove exercise IPv6 routes",
        ),
        PlannedCommand(("rfkill", "block", "wifi"), "keep Wi-Fi blocked"),
        PlannedCommand(("rfkill", "block", "wwan"), "keep WWAN blocked"),
        PlannedCommand(("rfkill", "block", "bluetooth"), "keep Bluetooth blocked"),
        PlannedCommand(
            ("systemctl", "start", "open-world-maintenance.target"),
            "enter maintenance only after the vulnerable surface is closed",
        ),
    ]


def maintenance_connectivity_plan(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    *,
    enabled: bool,
) -> list[PlannedCommand]:
    chosen = profile["network"]["maintenanceConnectivityService"]
    allowed = set(manifest["services"]["maintenanceConnectivity"])
    if chosen not in allowed:
        raise ContractError(
            "profile maintenanceConnectivityService is not allowlisted by manifest"
        )
    if enabled:
        return [
            PlannedCommand(
                ("ip", "link", "set", "dev", profile["network"]["wiredInterface"], "down"),
                "keep the physically disconnected direct-link interface down",
            ),
            PlannedCommand(
                ("ip", "address", "flush", "dev", profile["network"]["wiredInterface"]),
                "remove any direct-link address before maintenance connectivity",
            ),
            PlannedCommand(
                ("systemctl", "restart", "nftables.service"),
                "restore the host maintenance firewall",
            ),
            PlannedCommand(
                ("systemctl", "start", "systemd-resolved.service"),
                "enable DNS only after maintenance preflight",
            ),
            PlannedCommand(("rfkill", "unblock", "wifi"), "enable Wi-Fi only"),
            PlannedCommand(
                ("systemctl", "start", chosen),
                f"start the selected maintenance connectivity service {chosen}",
            ),
        ]
    return [
        PlannedCommand(
            (
                "nft",
                "--file",
                "/etc/nftables.d/open-world-quarantine.nft",
            ),
            "restore quarantine before stopping connectivity",
        ),
        PlannedCommand(
            (
                "systemctl",
                "stop",
                *manifest["services"]["maintenanceConnectivity"],
            ),
            "stop every maintenance connectivity service",
        ),
        PlannedCommand(("rfkill", "block", "wifi"), "block Wi-Fi"),
    ]


def run_commands(
    commands: list[PlannedCommand],
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> None:
    for command in commands:
        completed = runner(
            list(command.args),
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise ContractError(
                f"mode transition failed during {command.purpose}: "
                f"{command.args!r}: {message}"
            )


def _require_apply_authority(actual: str | None, expected: str) -> None:
    if actual != expected:
        raise ContractError(f"confirmation must exactly equal: {expected}")
    if os.name != "posix" or os.geteuid() != 0:
        raise ContractError("mode mutation requires root on Debian")


def _require_mode_host(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
) -> None:
    issues = evaluate_host_binding(manifest, profile, inventory)
    if issues:
        raise ContractError(
            "mode mutation is not bound to the target Debian: "
            + "; ".join(issue.detail for issue in issues)
        )


def enter_exercise(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    *,
    apply: bool,
    confirmation: str | None,
    inventory_provider: Callable[[], dict[str, Any]] | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    plan = exercise_plan(manifest, profile, inventory)
    if not apply:
        return {
            "applied": False,
            "mode": "exercise",
            "plan": [item.to_dict() for item in plan],
            "sessionPlan": {
                "requires": "trusted fresh-state marker and no prior state/session files",
                "writesAtomically": [
                    "/etc/examserver-open-world/session.env",
                    "/run/examserver-open-world/session-id",
                ],
                "before": "open-world-exercise.target",
            },
        }
    _require_apply_authority(
        confirmation, manifest["mode"]["exerciseConfirmation"]
    )
    if inventory_provider is None:
        raise ContractError("live inventory provider is required for apply")
    _require_mode_host(manifest, profile, inventory)
    EXERCISE_MARKER.unlink(missing_ok=True)
    run_commands(plan, runner)
    isolation_issues = evaluate_exercise(
        manifest, profile, inventory_provider(), require_services=False
    )
    if isolation_issues:
        run_commands(maintenance_plan(manifest, profile), runner)
        raise ContractError(
            "exercise isolation preflight failed: "
            + "; ".join(issue.detail for issue in isolation_issues)
        )

    try:
        session_id = prepare_fresh_session()
    except Exception:
        run_commands(maintenance_plan(manifest, profile), runner)
        raise
    RUNTIME_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    EXERCISE_MARKER.write_text("preflight-passed\n", encoding="ascii")
    os.chmod(EXERCISE_MARKER, 0o600)
    try:
        run_commands(
            [
                PlannedCommand(
                    ("systemctl", "start", "open-world-exercise.target"),
                    "start exercise services after isolation passed",
                )
            ],
            runner,
        )
        ready_issues = evaluate_exercise(
            manifest, profile, inventory_provider(), require_services=True
        )
        if ready_issues:
            raise ContractError(
                "exercise ready preflight failed: "
                + "; ".join(issue.detail for issue in ready_issues)
            )
    except Exception:
        EXERCISE_MARKER.unlink(missing_ok=True)
        run_commands(maintenance_plan(manifest, profile), runner)
        raise
    return {
        "applied": True,
        "mode": "exercise",
        "passed": True,
        "sessionId": session_id,
    }


def enter_maintenance(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    *,
    apply: bool,
    confirmation: str | None,
    inventory_provider: Callable[[], dict[str, Any]] | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    plan = maintenance_plan(manifest, profile)
    if not apply:
        return {"applied": False, "mode": "maintenance", "plan": [item.to_dict() for item in plan]}
    _require_apply_authority(
        confirmation, manifest["mode"]["maintenanceConfirmation"]
    )
    if inventory_provider is None:
        raise ContractError("live inventory provider is required for apply")
    _require_mode_host(manifest, profile, inventory_provider())
    EXERCISE_MARKER.unlink(missing_ok=True)
    run_commands(plan, runner)
    issues = evaluate_maintenance(
        manifest,
        profile,
        inventory_provider(),
        connectivity_may_be_enabled=False,
    )
    if issues:
        raise ContractError(
            "maintenance preflight failed: "
            + "; ".join(issue.detail for issue in issues)
        )
    return {"applied": True, "mode": "maintenance", "passed": True}


def set_maintenance_connectivity(
    manifest: dict[str, Any],
    profile: dict[str, Any],
    inventory: dict[str, Any],
    *,
    enabled: bool,
    apply: bool,
    confirmation: str | None,
    inventory_provider: Callable[[], dict[str, Any]] | None = None,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    preflight_issues = evaluate_maintenance(
        manifest,
        profile,
        inventory,
        connectivity_may_be_enabled=False,
    )
    if enabled:
        preflight_issues.extend(
            evaluate_connectivity_clean_state(profile, inventory)
        )
    if enabled and preflight_issues:
        raise ContractError(
            "maintenance connectivity remains blocked: "
            + "; ".join(issue.detail for issue in preflight_issues)
        )
    plan = maintenance_connectivity_plan(
        manifest, profile, enabled=enabled
    )
    if not apply:
        return {
            "applied": False,
            "mode": "maintenance-connectivity",
            "enabled": enabled,
            "trustedRecoveryRequiredAfterExercise": enabled,
            "plan": [item.to_dict() for item in plan],
        }
    expected = (
        manifest["mode"]["connectivityConfirmation"]
        if enabled
        else manifest["mode"]["maintenanceConfirmation"]
    )
    _require_apply_authority(confirmation, expected)
    if inventory_provider is None:
        raise ContractError("live inventory provider is required for apply")
    _require_mode_host(manifest, profile, inventory)
    run_commands(plan, runner)
    postflight_inventory = inventory_provider()
    postflight_issues = evaluate_maintenance(
        manifest,
        profile,
        postflight_inventory,
        connectivity_may_be_enabled=enabled,
    )
    if enabled:
        postflight_issues.extend(
            evaluate_connectivity_clean_state(profile, postflight_inventory)
        )
    if postflight_issues:
        if enabled:
            run_commands(
                maintenance_connectivity_plan(
                    manifest, profile, enabled=False
                ),
                runner,
            )
        raise ContractError(
            "maintenance connectivity postflight failed: "
            + "; ".join(issue.detail for issue in postflight_issues)
        )
    return {
        "applied": True,
        "mode": "maintenance-connectivity",
        "enabled": enabled,
    }
