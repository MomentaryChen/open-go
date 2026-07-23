import { Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { SettingsService } from '../../settings/settings.service';
import {
  defaultModelFor,
  parseLlmProvider,
  tripConfig,
} from '../trip.config';
import { AnthropicLlmService } from './anthropic-llm.service';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmRequest, LlmTarget, StructuredLlm } from './llm.types';

/**
 * Resolves which provider/model to use on every call, so admins can switch
 * the LLM via the trip.llmProvider / trip.llmModel settings without a
 * restart. Fallback chain: DB setting → env (TRIP_LLM_PROVIDER / TRIP_MODEL)
 * → built-in default. A blank trip.llmModel means "the provider's default",
 * so switching providers never carries the other provider's model along.
 */
@Injectable()
export class LlmRouterService implements StructuredLlm {
  private readonly logger = new Logger(LlmRouterService.name);
  /** Last resolved target, logged only when it changes to keep logs quiet. */
  private lastLogged?: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly gemini: GeminiLlmService,
    private readonly anthropic: AnthropicLlmService,
  ) {}

  async target(): Promise<LlmTarget> {
    const requested = await this.settings.getString(
      'trip.llmProvider',
      tripConfig.llmProvider,
    );
    const provider = parseLlmProvider(requested);
    if (!provider) {
      this.logger.warn(
        `Unknown trip.llmProvider "${requested}", falling back to ${tripConfig.llmProvider}`,
      );
    }
    const resolved = provider ?? tripConfig.llmProvider;

    // "auto" (the seeded default) means the resolved provider's own default,
    // so switching providers never carries the other provider's model along.
    const rawModel = await this.settings.getString('trip.llmModel', 'auto');
    const model =
      rawModel.toLowerCase() === 'auto'
        ? defaultModelFor(resolved)
        : rawModel;
    return { provider: resolved, model };
  }

  async generate<T extends z.ZodType>(
    request: LlmRequest<T>,
  ): Promise<z.infer<T>> {
    const { provider, model } = await this.target();

    const line = `provider=${provider} model=${model}`;
    if (line !== this.lastLogged) {
      this.logger.log(`Trip LLM: ${line}`);
      this.lastLogged = line;
    }

    const service = provider === 'anthropic' ? this.anthropic : this.gemini;
    return service.generate(model, request);
  }
}
