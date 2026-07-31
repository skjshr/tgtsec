import {
  IconAdjustments,
  IconChevronRight,
  IconLogout2,
  IconMap2,
  IconMenu2,
  IconMessageCircleQuestion,
  IconPalette,
  IconShield,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { guidancePresetFor } from "../guidance";
import { THEME_OPTIONS, type ThemeMode } from "../theme";
import type {
  ExperienceMode,
  GuidanceConfig,
  ScreenId,
} from "../types";

interface AppHeaderProps {
  activeScreen: ScreenId;
  onScreenChange: (screen: ScreenId) => void;
  onEnd: () => void;
  sessionEnded: boolean;
  experience: ExperienceMode;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  guidance: GuidanceConfig;
  guidancePending: boolean;
  onGuidanceChange: (commandId: string) => void;
}

export function AppHeader({
  activeScreen,
  onScreenChange,
  onEnd,
  sessionEnded,
  experience,
  theme,
  onThemeChange,
  guidance,
  guidancePending,
  onGuidanceChange,
}: AppHeaderProps) {
  const appMenuRef = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTheme =
    THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0];
  const guidancePreset = guidancePresetFor(guidance);

  const closeMenu = () => {
    appMenuRef.current?.removeAttribute("open");
    setMenuOpen(false);
  };

  const selectScreen = (screen: ScreenId) => {
    onScreenChange(screen);
    closeMenu();
  };

  const selectTheme = (nextTheme: ThemeMode) => {
    onThemeChange(nextTheme);
    closeMenu();
  };

  const endSession = () => {
    closeMenu();
    appMenuRef.current?.querySelector("summary")?.focus();
    onEnd();
  };

  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="ExamServer 調査ガイド">
        <IconShield aria-hidden="true" stroke={1.7} />
        <span className="brand-name">ExamServer</span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-lab">調査ガイド</span>
      </div>

      <div className="header-actions">
        <details
          ref={appMenuRef}
          className="app-menu"
          onToggle={(event) => setMenuOpen(event.currentTarget.open)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              event.currentTarget.removeAttribute("open");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.removeAttribute("open");
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label="メニュー">
            <IconMenu2 aria-hidden="true" />
            <span>メニュー</span>
          </summary>

          <div className="app-menu-panel" hidden={!menuOpen}>
            <span
              className={`app-menu-status experience-label experience-label--${experience}`}
            >
              {experience === "live" ? "接続中" : "接続前"}
            </span>
            <nav className="app-menu-section" aria-label="ラボ内の画面">
              <span className="app-menu-label">画面</span>
              <button
                type="button"
                aria-current={activeScreen === "map" ? "page" : undefined}
                onClick={() => selectScreen("map")}
              >
                <IconMap2 aria-hidden="true" />
                <span>探索地図</span>
                <IconChevronRight aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-current={
                  activeScreen === "consultation" ? "page" : undefined
                }
                onClick={() => selectScreen("consultation")}
              >
                <IconMessageCircleQuestion aria-hidden="true" />
                <span>次の手順</span>
                <IconChevronRight aria-hidden="true" />
              </button>
            </nav>

            <div
              className="app-menu-section app-menu-guidance"
              role="group"
              aria-label="難易度とヒント表示"
            >
              <span className="app-menu-label">
                <IconAdjustments aria-hidden="true" />
                難易度とヒント
                <small>{guidancePreset.toUpperCase()}</small>
              </span>
              <div className="guidance-presets">
                {(["easy", "normal", "hard"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={guidancePreset === preset}
                    disabled={guidancePending}
                    onClick={() =>
                      onGuidanceChange(`preset.${preset}`)
                    }
                  >
                    {preset.toUpperCase()}
                  </button>
                ))}
              </div>
              <details className="guidance-custom">
                <summary>表示を細かく選ぶ</summary>
                {(
                  [
                    ["showNextChoices", "次の候補"],
                    ["showToolNames", "道具名"],
                    ["showCommandSyntax", "コマンドの組み方"],
                    ["showCommandExamples", "実行例"],
                    ["explainNoProgress", "変化がない時の説明"],
                  ] as const
                ).map(([field, label]) => (
                  <button
                    key={field}
                    type="button"
                    role="switch"
                    aria-checked={guidance[field]}
                    disabled={guidancePending}
                    onClick={() =>
                      onGuidanceChange(
                        `${field}.${guidance[field] ? "off" : "on"}`,
                      )
                    }
                  >
                    <span>{label}</span>
                    <small>{guidance[field] ? "表示" : "非表示"}</small>
                  </button>
                ))}
                <button
                  type="button"
                  role="switch"
                  aria-checked={guidance.explanationDepth === "full"}
                  disabled={guidancePending}
                  onClick={() =>
                    onGuidanceChange(
                      `explanationDepth.${
                        guidance.explanationDepth === "full"
                          ? "brief"
                          : "full"
                      }`,
                    )
                  }
                >
                  <span>説明の詳しさ</span>
                  <small>
                    {guidance.explanationDepth === "full" ? "詳しく" : "短く"}
                  </small>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={guidance.silhouetteDepth === 1}
                  disabled={guidancePending}
                  onClick={() =>
                    onGuidanceChange(
                      `silhouetteDepth.${
                        guidance.silhouetteDepth === 1 ? "0" : "1"
                      }`,
                    )
                  }
                >
                  <span>次のシルエット</span>
                  <small>
                    {guidance.silhouetteDepth === 1 ? "表示" : "最小"}
                  </small>
                </button>
              </details>
            </div>

            <div
              className="app-menu-section app-menu-themes"
              role="group"
              aria-label="表示テーマ"
            >
              <span className="app-menu-label">
                <IconPalette aria-hidden="true" />
                見た目
                <small>{activeTheme.label}</small>
              </span>
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-label={`${option.label} ${option.description}`}
                  aria-pressed={theme === option.id}
                  title={`${option.label} - ${option.description}`}
                  onClick={() => selectTheme(option.id)}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>

            {experience === "live" ? (
              <button
                type="button"
                className="app-menu-end"
                aria-label={sessionEnded ? "表示は終了済み" : "表示を終了"}
                onClick={endSession}
                disabled={sessionEnded}
              >
                <IconLogout2 aria-hidden="true" />
                <span>{sessionEnded ? "終了しました" : "表示を終了"}</span>
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}
