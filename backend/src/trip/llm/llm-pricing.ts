/**
 * List-price estimates in USD per million tokens, matched by model-name
 * pattern (first match wins). Deliberately an estimate: providers change
 * prices and add tiers, so the admin UI labels the result "estimated" and an
 * unknown model yields null rather than a silently wrong number.
 */
type ModelPricing = {
  match: RegExp;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const PRICING: ModelPricing[] = [
  // Anthropic (cache read = 0.1x input, 5-minute cache write = 1.25x input).
  {
    match: /^claude-opus-4/,
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  {
    match: /^claude-sonnet-4/,
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  {
    match: /^claude-haiku-4/,
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  {
    match: /^claude-3-5-haiku/,
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  // Gemini (implicit caching bills cached input at ~0.25x, no write charge).
  // "-lite" before the general flash patterns so it is not shadowed.
  {
    match: /^gemini-.*flash-lite/,
    input: 0.1,
    output: 0.4,
    cacheRead: 0.025,
    cacheWrite: 0,
  },
  {
    match: /^gemini.*flash/,
    input: 0.3,
    output: 2.5,
    cacheRead: 0.075,
    cacheWrite: 0,
  },
  {
    match: /^gemini.*pro/,
    input: 1.25,
    output: 10,
    cacheRead: 0.31,
    cacheWrite: 0,
  },
];

export type LlmTokenTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
};

/**
 * Estimated USD cost for a token bundle, or null when the model is not in the
 * pricing table. Thinking tokens bill at the output rate (Gemini reports them
 * separately; Anthropic already includes them in outputTokens).
 */
export function estimateCostUsd(
  model: string,
  tokens: LlmTokenTotals,
): number | null {
  const pricing = PRICING.find((entry) => entry.match.test(model));
  if (!pricing) return null;

  const perToken = (rate: number) => rate / 1_000_000;
  return (
    tokens.inputTokens * perToken(pricing.input) +
    (tokens.outputTokens + tokens.thinkingTokens) * perToken(pricing.output) +
    tokens.cacheReadTokens * perToken(pricing.cacheRead) +
    tokens.cacheWriteTokens * perToken(pricing.cacheWrite)
  );
}
