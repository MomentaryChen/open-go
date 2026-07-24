import { Module } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { AnthropicLlmService } from './anthropic-llm.service';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmRouterService } from './llm-router.service';
import { LlmUsageService } from './llm-usage.service';
import { STRUCTURED_LLM } from './llm.types';

@Module({
  imports: [SettingsModule],
  providers: [
    LlmUsageService,
    GeminiLlmService,
    AnthropicLlmService,
    LlmRouterService,
    { provide: STRUCTURED_LLM, useExisting: LlmRouterService },
  ],
  exports: [STRUCTURED_LLM],
})
export class LlmModule {}
