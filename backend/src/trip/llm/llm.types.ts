import * as z from 'zod/v4';

export type LlmRequest<T extends z.ZodType> = {
  /** Instructions describing the role and hard rules. */
  system: string;
  /**
   * Ordered user content. A part marked `cacheable` is large and stable within a
   * job, so providers that support prompt caching should cache it.
   */
  parts: Array<{ text: string; cacheable?: boolean }>;
  /** The shape the model must return; also the runtime validator. */
  schema: T;
  maxOutputTokens: number;
  /** How hard the model should think. Mapped onto each provider's own control. */
  effort: 'low' | 'medium' | 'high';
};

export type LlmTarget = { provider: string; model: string };

export interface StructuredLlm {
  /**
   * The provider/model a generate() call issued now would use. Async because
   * the router consults admin-editable settings, so the answer can change
   * between calls without a restart.
   */
  target(): Promise<LlmTarget>;
  generate<T extends z.ZodType>(request: LlmRequest<T>): Promise<z.infer<T>>;
}

export const STRUCTURED_LLM = Symbol('STRUCTURED_LLM');
