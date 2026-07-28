import { IconFlag2, IconSend } from "@tabler/icons-react";
import { useState, type FormEvent } from "react";
import type { FlagSubmissionResult } from "../types";

interface ManualFlagFormProps {
  pending: boolean;
  onSubmit: (flag: string) => Promise<FlagSubmissionResult | undefined>;
  mode?: "fallback" | "bonus";
}

export function ManualFlagForm({
  pending,
  onSubmit,
  mode = "fallback",
}: ManualFlagFormProps) {
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState<FlagSubmissionResult | undefined>();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = flag.trim();
    if (!value) return;
    setResult(undefined);
    const nextResult = await onSubmit(value);
    if (!nextResult) return;
    setResult(nextResult);
    if (nextResult.accepted) setFlag("");
  };

  return (
    <form className="manual-flag-form" onSubmit={handleSubmit}>
      <div className="manual-flag-heading">
        <IconFlag2 aria-hidden="true" />
        <div>
          <strong>flagを手動で提出</strong>
          <small>
            {mode === "bonus"
              ? "root取得後のWindows追加flagは手動で確認します。"
              : "自動検出が戻るまでの代替手段です。"}
          </small>
        </div>
      </div>
      <label htmlFor="manual-flag">
        {mode === "bonus" ? "Windowsで見つけたflag" : "見つけたflag"}
      </label>
      <div className="manual-flag-controls">
        <input
          id="manual-flag"
          name="flag"
          value={flag}
          onChange={(event) => setFlag(event.target.value)}
          aria-invalid={result?.accepted === false}
          autoComplete="off"
          spellCheck={false}
          placeholder="flag全体を入力"
        />
        <button type="submit" disabled={pending || !flag.trim()}>
          <IconSend aria-hidden="true" />
          {pending ? "送信中" : "提出"}
        </button>
      </div>
      <p
        className={`manual-flag-result ${result?.accepted ? "is-accepted" : "is-rejected"}`}
        role="status"
        aria-live="polite"
      >
        {result?.message ?? ""}
      </p>
    </form>
  );
}
