const ANSWERS = Object.freeze({
  "flag-entry-web":
    "FLAG{ow_web_diagnostic_c8ce86ed0d7ff1774f694c82a7aab6b0}",
  "flag-entry-smb":
    "FLAG{ow_smb_handover_722e7203ff0475cbecb27d39729c9fd8}",
  "flag-entry-nfs":
    "FLAG{ow_nfs_ownership_e33a5e460c417f2c30c5afa984a58dcb}",
  "flag-foothold-www-data":
    "FLAG{ow_www_data_foothold_c991f8fa92ce878ee7937c0cd5c701bb}",
  "flag-foothold-sales":
    "FLAG{ow_sales_foothold_e8d055cf8eeb409bd2b82736319b2daa}",
  "flag-foothold-mechanic":
    "FLAG{ow_mechanic_foothold_e119f66569bb885a09a8102b1621fd18}",
  "flag-clue-sudo":
    "FLAG{ow_clue_sudo_hook_2d1c474a373fee7cbdb7adff80e260a3}",
  "flag-clue-timer":
    "FLAG{ow_clue_timer_payload_c7e1cb22cfee593c8dbb23f6b80a6aba}",
  "flag-clue-suid":
    "FLAG{ow_clue_suid_path_45b76bde29ca3078b6f50d1905bdaa79}",
  "flag-route-sudo":
    "FLAG{ow_route_sudo_hook_94b3d31b805de29ed55df35a7c06c4fa}",
  "flag-route-timer":
    "FLAG{ow_route_timer_payload_f3b48ba001b34c24bb175e408f670c28}",
  "flag-route-suid":
    "FLAG{ow_route_suid_path_357f9b3df637c104ac13934621e9f973}",
  "flag-root-common":
    "FLAG{ow_debian_root_67be4b714bbafc79b6def31d68cd7823}",
  "flag-windows":
    "FLAG{ow_windows_archive_d9f5fb64e9bcbeccc0471e74f3468fa09303affe612713c1}",
});

export function getPrivateFlagAnswer(flagId) {
  const answer = ANSWERS[flagId];
  if (answer === undefined) {
    throw new Error(`Unknown flag id: ${flagId}`);
  }
  return answer;
}

export function getPrivateFlagIds() {
  return Object.keys(ANSWERS);
}
