import type { GuidanceConfig } from "./types";

export const GUIDANCE_PRESETS: Readonly<
  Record<"easy" | "normal" | "hard", GuidanceConfig>
> = Object.freeze({
  easy: Object.freeze({
    showNextChoices: true,
    showToolNames: true,
    showCommandSyntax: true,
    showCommandExamples: true,
    explainNoProgress: true,
    explanationDepth: "full",
    silhouetteDepth: 1,
  }),
  normal: Object.freeze({
    showNextChoices: true,
    showToolNames: true,
    showCommandSyntax: true,
    showCommandExamples: false,
    explainNoProgress: true,
    explanationDepth: "full",
    silhouetteDepth: 1,
  }),
  hard: Object.freeze({
    showNextChoices: false,
    showToolNames: false,
    showCommandSyntax: false,
    showCommandExamples: false,
    explainNoProgress: false,
    explanationDepth: "brief",
    silhouetteDepth: 0,
  }),
});

export const EASY_GUIDANCE: GuidanceConfig = {
  ...GUIDANCE_PRESETS.easy,
};

export function guidancePresetFor(
  guidance: GuidanceConfig,
): "easy" | "normal" | "hard" | "custom" {
  const serialized = JSON.stringify(guidance);
  const matched = Object.entries(GUIDANCE_PRESETS).find(
    ([, value]) => JSON.stringify(value) === serialized,
  )?.[0];
  return matched === "easy" || matched === "normal" || matched === "hard"
    ? matched
    : "custom";
}

export function applyGuidanceCommand(
  guidance: GuidanceConfig,
  commandId: string,
): GuidanceConfig {
  if (commandId.startsWith("preset.")) {
    const preset = commandId.slice(7);
    if (preset === "easy" || preset === "normal" || preset === "hard") {
      return { ...GUIDANCE_PRESETS[preset] };
    }
  }

  const [field, value] = commandId.split(".");
  const next = { ...guidance };
  if (
    field === "showNextChoices" ||
    field === "showToolNames" ||
    field === "showCommandSyntax" ||
    field === "showCommandExamples" ||
    field === "explainNoProgress"
  ) {
    if (value !== "on" && value !== "off") throw new Error("invalid_guidance");
    next[field] = value === "on";
    return next;
  }
  if (
    field === "explanationDepth" &&
    (value === "brief" || value === "full")
  ) {
    next.explanationDepth = value;
    return next;
  }
  if (field === "silhouetteDepth" && (value === "0" || value === "1")) {
    next.silhouetteDepth = value === "0" ? 0 : 1;
    return next;
  }
  throw new Error("invalid_guidance");
}
