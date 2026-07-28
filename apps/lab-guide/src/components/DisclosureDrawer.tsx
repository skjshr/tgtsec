import { IconGripVertical, IconX } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DisclosureDrawerProps {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function DisclosureDrawer({
  id,
  open,
  title,
  onClose,
  children,
}: DisclosureDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      closeRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!drawerRef.current?.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="disclosure-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={drawerRef}
        id={id}
        className="disclosure-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="disclosure-drawer-header">
          <span className="disclosure-drawer-grip" aria-hidden="true">
            <IconGripVertical />
          </span>
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="disclosure-close"
            aria-label={`${title}を閉じる`}
            onClick={onClose}
          >
            <IconX aria-hidden="true" />
          </button>
        </header>
        <div className="disclosure-drawer-body">{children}</div>
      </section>
    </div>
  );
}

interface DisclosurePullProps {
  label: string;
  meta?: string;
  icon: ReactNode;
  controls: string;
  open: boolean;
  onClick: () => void;
}

export function DisclosurePull({
  label,
  meta,
  icon,
  controls,
  open,
  onClick,
}: DisclosurePullProps) {
  const accessibleMeta = meta ? `、${meta}` : "";

  return (
    <button
      type="button"
      className="disclosure-pull"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${label}${accessibleMeta}を開く`}
      onClick={onClick}
    >
      <span className="disclosure-pull-cord" aria-hidden="true" />
      <span className="disclosure-pull-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="disclosure-pull-label">{label}</span>
      {meta ? <span className="disclosure-pull-meta">{meta}</span> : null}
    </button>
  );
}
