import { IconAlertTriangle, IconLogout2, IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";

interface EndSessionDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EndSessionDialog({
  open,
  onCancel,
  onConfirm,
}: EndSessionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="end-session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        aria-describedby="end-session-description"
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="閉じる"
          onClick={onCancel}
        >
          <IconX aria-hidden="true" />
        </button>
        <IconAlertTriangle className="dialog-symbol" aria-hidden="true" />
        <h2 id="end-session-title">演習を終了しますか？</h2>
        <p id="end-session-description">
          この画面を終了しても、標的ノートは初期化されません。終了後は運営者へ復旧を依頼してください。
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel} ref={cancelRef}>
            探索を続ける
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            <IconLogout2 aria-hidden="true" />
            終了する
          </button>
        </div>
      </section>
    </div>
  );
}
