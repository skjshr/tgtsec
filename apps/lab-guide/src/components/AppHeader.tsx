import {
  IconChevronRight,
  IconLogout2,
  IconMap2,
  IconMenu2,
  IconMessageCircleQuestion,
  IconPalette,
  IconShield,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
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
  const appMenuRef = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTheme =
    THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0];

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
      <div className="brand-lockup" aria-label="ExamServer 実践ラボ">
        <IconShield aria-hidden="true" stroke={1.7} />
        <span className="brand-name">ExamServer</span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-lab">実践ラボ</span>
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
              {experience === "live" ? "ライブ演習" : "公開ガイド"}
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
                <span>状況相談</span>
                <IconChevronRight aria-hidden="true" />
              </button>
            </nav>

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
                aria-label={sessionEnded ? "演習は終了済み" : "演習を終了"}
                onClick={endSession}
                disabled={sessionEnded}
              >
                <IconLogout2 aria-hidden="true" />
                <span>{sessionEnded ? "終了しました" : "演習を終了"}</span>
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}
