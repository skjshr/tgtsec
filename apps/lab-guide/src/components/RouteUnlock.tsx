import { IconRoute } from "@tabler/icons-react";
import { ROUTE_ACHIEVEMENTS } from "../route-achievements";
import type { RouteAchievementId } from "../route-achievements";

interface RouteUnlockProps {
  routeId: RouteAchievementId;
}

export function RouteUnlock({ routeId }: RouteUnlockProps) {
  const achievement = ROUTE_ACHIEVEMENTS[routeId];

  return (
    <section
      className="success-callout route-achievement"
      aria-label="経路実績を解除"
    >
      <IconRoute aria-hidden="true" />
      <div>
        <span className="route-achievement-kicker">
          ROUTE UNLOCKED · 経路実績を解除
        </span>
        <strong>{achievement.label}</strong>
        <span>
          今回の入口とroot経路が確定しました。地図で因果を振り返れます。
        </span>
      </div>
    </section>
  );
}
