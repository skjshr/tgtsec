import {
  IconActivityHeartbeat,
  IconBook2,
  IconCircleCheckFilled,
  IconListDetails,
} from "@tabler/icons-react";
import type { ConnectionStatus, RecentEvent } from "../types";

interface EventStripProps {
  events: RecentEvent[];
  connectionStatus: ConnectionStatus;
  connectionMessage?: string;
  fullWidth?: boolean;
  showHeading?: boolean;
}

export function EventStrip({
  events,
  connectionStatus,
  connectionMessage,
  fullWidth = false,
  showHeading = true,
}: EventStripProps) {
  return (
    <section
      className={`event-strip ${fullWidth ? "event-strip--full" : ""}`}
      aria-labelledby={showHeading ? "recent-events-title" : undefined}
      aria-label={showHeading ? undefined : "最近の発見"}
    >
      {showHeading ? (
        <h2 id="recent-events-title">
          <IconListDetails aria-hidden="true" />
          最近の発見
        </h2>
      ) : null}
      {events.length > 0 ? (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <time>{event.at}</time>
              <span>{event.message}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="events-empty">接続を確認すると、ここに発見が並びます。</p>
      )}
      <div className={`telemetry-note telemetry-note--${connectionStatus}`}>
        {connectionStatus === "live" ? (
          <IconCircleCheckFilled aria-hidden="true" />
        ) : connectionStatus === "browse" ? (
          <IconBook2 aria-hidden="true" />
        ) : (
          <IconActivityHeartbeat aria-hidden="true" />
        )}
        <span>
          {connectionMessage ??
            (connectionStatus === "live"
              ? "自動検出は教材イベントだけを記録します"
              : connectionStatus === "browse"
                ? "公開ガイドです。攻撃の進行データは表示していません"
              : "状態を確認しています")}
        </span>
      </div>
    </section>
  );
}
