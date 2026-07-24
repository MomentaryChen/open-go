import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable } from '@nestjs/common';
import * as z from 'zod/v4';
import { LlmUsageService } from './llm-usage.service';
import { LlmRequest } from './llm.types';

@Injectable()
export class AnthropicLlmService {
  readonly provider = 'anthropic';
  private cached?: Anthropic;

  constructor(private readonly usage: LlmUsageService) {}

  async generate<T extends z.ZodType>(
    model: string,
    request: LlmRequest<T>,
  ): Promise<z.infer<T>> {
    const message = await this.client().messages.parse({
      model,
      max_tokens: request.maxOutputTokens,
      thinking: { type: 'adaptive' },
      system: request.system,
      output_config: {
        effort: request.effort,
        format: zodOutputFormat(request.schema),
      },
      messages: [
        {
          role: 'user',
          content: request.parts.map((part) => ({
            type: 'text' as const,
            text: part.text,
            ...(part.cacheable
              ? { cache_control: { type: 'ephemeral' as const } }
              : {}),
          })),
        },
      ],
    });

    // Record before the parse check: the tokens are billed either way.
    // Anthropic's input_tokens already excludes cache reads/writes, and
    // thinking tokens are folded into output_tokens.
    this.usage.record({
      provider: this.provider,
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    });

    const parsed = message.parsed_output;
    if (!parsed) {
      throw new Error('Claude did not return a parsable response');
    }
    return parsed;
  }

  private client() {
    if (!this.cached) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          'ANTHROPIC_API_KEY is not set; required when TRIP_LLM_PROVIDER=anthropic',
        );
      }
      this.cached = new Anthropic();
    }
    return this.cached;
  }
}
