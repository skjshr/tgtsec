export const THEME_STORAGE_KEY = "examserver-open-world:theme:v1";

export const THEME_OPTIONS = [
  {
    id: "play",
    label: "PLAY",
    description: "ポップゲーム",
  },
  {
    id: "ops",
    label: "OPS",
    description: "ハッカー",
  },
  {
    id: "focus",
    label: "FOCUS",
    description: "シンプル",
  },
] as const;

export type ThemeMode = (typeof THEME_OPTIONS)[number]["id"];

function getBrowserStorage() {
  try {
    return globalThis.window?.localStorage;
  } catch {
    return undefined;
  }
}

function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_OPTIONS.some((theme) => theme.id === value);
}

export function readStoredTheme(
  storage: Pick<Storage, "getItem"> | undefined = getBrowserStorage(),
): ThemeMode {
  if (!storage) return "play";

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "play";
  } catch {
    return "play";
  }
}

export function applyTheme(
  theme: ThemeMode,
  root: HTMLElement | undefined = globalThis.document?.documentElement,
) {
  if (!root) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "ops" ? "dark" : "light";
}

export function persistTheme(
  theme: ThemeMode,
  storage: Pick<Storage, "setItem"> | undefined = getBrowserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Blocked storage must not make the local learning guide unusable.
  }
}
