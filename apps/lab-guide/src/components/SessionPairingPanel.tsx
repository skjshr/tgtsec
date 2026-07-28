import {
  IconKey,
  IconLoader2,
  IconPlugConnected,
} from "@tabler/icons-react";
import { FormEvent, useState } from "react";

interface SessionPairingPanelProps {
  pending: boolean;
  error?: string;
  onPair: (code: string) => Promise<boolean>;
}

export function SessionPairingPanel({
  pending,
  error,
  onPair,
}: SessionPairingPanelProps) {
  const [code, setCode] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onPair(code)) setCode("");
  };

  return (
    <section
      className="session-pairing"
      aria-labelledby="session-pairing-title"
    >
      <span className="session-pairing-icon" aria-hidden="true">
        <IconPlugConnected />
      </span>
      <div className="session-pairing-copy">
        <h2 id="session-pairing-title">攻撃を始めるときだけライブ接続</h2>
        <p>
          Kali Bridgeに表示された6文字を入力すると、発見に合わせて地図と説明が変わります。
        </p>
      </div>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="pairing-code">
          接続コード
          <span>英数字6文字</span>
        </label>
        <div className="session-pairing-controls">
          <span className="session-pairing-input">
            <IconKey aria-hidden="true" />
            <input
              id="pairing-code"
              name="pairing-code"
              value={code}
              onChange={(event) =>
                setCode(
                  event.currentTarget.value
                    .toUpperCase()
                    .replace(/[^A-Z2-9]/g, "")
                    .slice(0, 6),
                )
              }
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              minLength={6}
              maxLength={6}
              required
              aria-describedby={error ? "pairing-error" : undefined}
              aria-invalid={error ? "true" : undefined}
            />
          </span>
          <button
            type="submit"
            className="primary-action"
            disabled={pending || code.length !== 6}
          >
            {pending ? (
              <IconLoader2 className="spin" aria-hidden="true" />
            ) : (
              <IconPlugConnected aria-hidden="true" />
            )}
            {pending ? "接続中" : "ライブ接続"}
          </button>
        </div>
        {error ? (
          <p id="pairing-error" className="session-pairing-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
