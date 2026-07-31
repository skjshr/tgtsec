export const ROUTE_ACHIEVEMENT_IDS = [
  "web-sudo",
  "web-timer",
  "web-suid",
  "smb-sudo",
  "smb-timer",
  "smb-suid",
  "nfs-sudo",
  "nfs-timer",
  "nfs-suid",
] as const;

export type RouteAchievementId =
  (typeof ROUTE_ACHIEVEMENT_IDS)[number];

interface RouteAchievement {
  entrance: string;
  rootPath: string;
  label: string;
}

const ENTRANCE_LABELS = {
  web: "Web診断",
  smb: "引き継ぎ共有",
  nfs: "整備場NFS",
} as const;

const ROOT_PATH_LABELS = {
  sudo: "sudo保守hook",
  timer: "root定期処理",
  suid: "SUID PATH",
} as const;

export const ROUTE_ACHIEVEMENTS: Readonly<
  Record<RouteAchievementId, RouteAchievement>
> = Object.freeze(
  Object.fromEntries(
    ROUTE_ACHIEVEMENT_IDS.map((id) => {
      const [entranceId, rootPathId] = id.split("-") as [
        keyof typeof ENTRANCE_LABELS,
        keyof typeof ROOT_PATH_LABELS,
      ];
      const entrance = ENTRANCE_LABELS[entranceId];
      const rootPath = ROOT_PATH_LABELS[rootPathId];
      return [
        id,
        Object.freeze({
          entrance,
          rootPath,
          label: `${entrance} × ${rootPath}`,
        }),
      ];
    }),
  ) as Record<RouteAchievementId, RouteAchievement>,
);

export function isRouteAchievementId(
  value: unknown,
): value is RouteAchievementId {
  return (
    typeof value === "string" &&
    ROUTE_ACHIEVEMENT_IDS.includes(value as RouteAchievementId)
  );
}
