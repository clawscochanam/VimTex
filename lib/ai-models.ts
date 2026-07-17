export const AI_MODELS = [
  {
    id: "tencent/hy3:free",
    label: "HY3",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron Ultra",
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: AiModelId = "tencent/hy3:free";

export function isAiModelId(value: string): value is AiModelId {
  return AI_MODELS.some((m) => m.id === value);
}
