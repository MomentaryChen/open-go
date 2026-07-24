import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { LlmUsageService } from './llm-usage.service';
import { LlmRequest } from './llm.types';

/** Gemini exposes thinking depth as a token budget; -1 lets the model decide. */
const THINKING_BUDGET: Record<LlmRequest<z.ZodType>['effort'], number> = {
  low: 0,
  medium: -1,
  high: -1,
};

@Injectable()
export class GeminiLlmService {
  readonly provider = 'gemini';
  private readonly logger = new Logger(GeminiLlmService.name);
  private cached?: GoogleGenAI;

  constructor(private readonly usage: LlmUsageService) {}

  async generate<T extends z.ZodType>(
    model: string,
    request: LlmRequest<T>,
  ): Promise<z.infer<T>> {
    const response = await this.withRetry(() =>
      this.generateOnce(model, request),
    );

    // Record before the content checks: even a truncated or empty response
    // was billed. Gemini's promptTokenCount includes cached tokens, so
    // subtract them to match Anthropic's "input excludes cache" convention.
    const meta = response.usageMetadata;
    if (meta) {
      const cached = meta.cachedContentTokenCount ?? 0;
      this.usage.record({
        provider: this.provider,
        model,
        inputTokens: Math.max(0, (meta.promptTokenCount ?? 0) - cached),
        outputTokens: meta.candidatesTokenCount ?? 0,
        cacheReadTokens: cached,
        thinkingTokens: meta.thoughtsTokenCount ?? 0,
      });
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    const text = response.text;
    if (!text) {
      throw new Error(
        `Gemini returned no content (finishReason=${finishReason ?? 'unknown'})`,
      );
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new Error(
        `Gemini output was truncated at ${request.maxOutputTokens} tokens (thinking tokens share this budget); raise maxOutputTokens`,
      );
    }

    return this.parse(request.schema, text);
  }

  private generateOnce<T extends z.ZodType>(
    model: string,
    request: LlmRequest<T>,
  ) {
    return this.client().models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: request.parts.map((part) => ({ text: part.text })),
        },
      ],
      config: {
        systemInstruction: request.system,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(request.schema),
        maxOutputTokens: request.maxOutputTokens,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET[request.effort] },
      },
    });
  }

  /**
   * Retry transient Gemini failures (503 UNAVAILABLE demand spikes, 429 rate
   * limits) with backoff; anything else propagates immediately.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delaysMs = [2000, 8000, 20000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const message = (error as Error).message ?? '';
        const transient =
          /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded/i.test(message);
        if (!transient || attempt >= delaysMs.length) throw error;

        this.logger.warn(
          `Gemini transient error (attempt ${attempt + 1}/${delaysMs.length + 1}), retrying in ${delaysMs[attempt]}ms: ${message.slice(0, 160)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }

  private parse<T extends z.ZodType>(schema: T, text: string): z.infer<T> {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned malformed JSON: ${text.slice(0, 200)}`);
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      this.logger.warn(
        `Gemini response failed schema validation: ${result.error.message}`,
      );
      throw new Error('Gemini response did not match the expected schema');
    }
    return result.data;
  }

  private client() {
    if (!this.cached) {
      const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY (or GOOGLE_API_KEY) is not set; required when TRIP_LLM_PROVIDER=gemini',
        );
      }
      this.cached = new GoogleGenAI({ apiKey });
    }
    return this.cached;
  }
}
