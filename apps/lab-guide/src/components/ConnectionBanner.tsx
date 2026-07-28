import {
  IconAlertCircle,
  IconBook2,
  IconLoader2,
  IconPlugConnected,
  IconRefresh,
  IconWifiOff,
} from "@tabler/icons-react";
import type { ConnectionStatus } from "../types";

interface ConnectionBannerProps {
  status: ConnectionStatus;
  message?: string;
  refreshing: boolean;
  onRefresh: () => void;
}

export function ConnectionBanner({
  status,
  message,
  refreshing,
  onRefresh,
}: ConnectionBannerProps) {
  if (status === "live") return null;

  const content = {
    browse: {
      icon: <IconBook2 aria-hidden="true" />,
      title: "公開ガイドを表示しています",
      body:
        message ??
        "標的がなくても世界と遊び方を確認できます。演習時だけライブ接続します。",
    },
    waiting: {
      icon: <IconPlugConnected aria-hidden="true" />,
      title: "Kali Bridgeを待っています",
      body:
        message ??
        "接続コードは確認できました。Bridgeが最初の状態を送ると自動で切り替わります。",
    },
    loading: {
      icon: <IconLoader2 className="spin" aria-hidden="true" />,
      title: "状態を更新しています",
      body: message ?? "最後に確認した内容を残したまま、新しい状態を読み込みます。",
    },
    reconnecting: {
      icon: <IconWifiOff aria-hidden="true" />,
      title: "自動接続を戻しています",
      body: message ?? "画面の選択内容は失われません。しばらく待つか、再読込してください。",
    },
    unavailable: {
      icon: <IconAlertCircle aria-hidden="true" />,
      title: "自動検出を利用できません",
      body: message ?? "探索は続けられます。必要ならflagを手動で提出してください。",
    },
  }[status];

  return (
    <div className={`connection-banner connection-banner--${status}`} role="status">
      {content.icon}
      <div>
        <strong>{content.title}</strong>
        <span>{content.body}</span>
      </div>
      {status !== "loading" && status !== "browse" ? (
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          <IconRefresh aria-hidden="true" />
          {refreshing ? "確認中" : "再読込"}
        </button>
      ) : null}
    </div>
  );
}
