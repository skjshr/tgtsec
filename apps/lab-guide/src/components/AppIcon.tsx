import type { ComponentType } from "react";
import {
  IconBrowser,
  IconCalendarEvent,
  IconDoor,
  IconFileDescription,
  IconFolder,
  IconNetwork,
  IconServer2,
  IconTerminal2,
  IconUser,
  IconWorld,
  type IconProps,
} from "@tabler/icons-react";
import type { IconKey } from "../types";

const icons: Record<IconKey, ComponentType<IconProps>> = {
  browser: IconBrowser,
  calendar: IconCalendarEvent,
  door: IconDoor,
  file: IconFileDescription,
  folder: IconFolder,
  globe: IconWorld,
  network: IconNetwork,
  server: IconServer2,
  terminal: IconTerminal2,
  user: IconUser,
};

interface AppIconProps extends IconProps {
  name: IconKey;
}

export function AppIcon({ name, ...props }: AppIconProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" {...props} />;
}
