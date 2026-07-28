import {
  IconLogout2,
  IconMap2,
  IconMessageCircleQuestion,
  IconPalette,
  IconShield,
} from "@tabler/icons-react";
import { useRef } from "react";
import { THEME_OPTIONS, type ThemeMode } from "../theme";
import type { ExperienceMode, ScreenId } from "../types";

interface AppHeaderProps {
  activeScreen: ScreenId;
  onScreenChange: (screen: ScreenId) => void;
  onEnd: () => void;
  sessionEnded: boolean;
  experience: ExperienceMode;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export function AppHeader({
  activeScreen,
  onScreenChange,
  onEnd,
  sessionEnded,
  experience,
  theme,
  onThemeChange,
}: AppHeaderProps) {
  const themeMenuRef = useRef<HTMLDetailsElement>(null);
  const activeTheme =
    THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0];

  const selectTheme = (nextTheme: ThemeMode) => {
    onThemeChange(nextTheme);
    themeMenuRef.current?.removeAttribute("open");
  };

  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="ExamServer 実践ラボ">
        <IconShield aria-hidden="true" stroke={1.7} />
        <span className="brand-name">ExamServer</span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-lab">
          <span>OPEN WORLD</span>
          実践ラボ
        </span>
      </div>

      <nav className="primary-nav" aria-label="ラボ内の画面">
        <button
          type="button"
          className="nav-tab"
          aria-current={activeScreen === "map" ? "page" : undefined}
          onClick={() => onScreenChange("map")}
        >
          <IconMap2 aria-hidden="true" />
          探索地図
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={activeScreen === "consultation" ? "page" : undefined}
          onClick={() => onScreenChange("consultation")}
        >
          <IconMessageCircleQuestion aria-hidden="true" />
          状況相談
        </button>
      </nav>

      <div className="header-actions">
        <span className={`experience-label experience-label--${experience}`}>
          {experience === "live" ? "ライブ演習" : "公開ガイド"}
        </span>
        <details
          ref={themeMenuRef}
          className="theme-menu"
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
          <summary aria-label={`見た目 ${activeTheme.label}`}>
            <IconPalette aria-hidden="true" />
            <span>見た目</span>
            <strong>{activeTheme.label}</strong>
          </summary>
          <div className="theme-menu-options" role="group" aria-label="表示テーマ">
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
        </details>

        {experience === "live" ? (
          <button
            type="button"
            className="end-session-button"
            aria-label={sessionEnded ? "演習は終了済み" : "演習を終了"}
            onClick={onEnd}
            disabled={sessionEnded}
          >
            <IconLogout2 aria-hidden="true" />
            <span>{sessionEnded ? "終了しました" : "演習を終了"}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
