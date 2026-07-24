import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type LlmUsageSample = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
};

/**
 * Persists per-call token usage for the admin cost view. Fire-and-forget: a
 * bookkeeping failure must never fail the LLM call whose tokens it records.
 */
@Injectable()
export class LlmUsageService {
  private readonly logger = new Logger(LlmUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(sample: LlmUsageSample): void {
    void this.prisma.llmUsage
      .create({
        data: {
          provider: sample.provider,
          model: sample.model,
          inputTokens: this.sanitize(sample.inputTokens),
          outputTokens: this.sanitize(sample.outputTokens),
          cacheReadTokens: this.sanitize(sample.cacheReadTokens),
          cacheWriteTokens: this.sanitize(sample.cacheWriteTokens),
          thinkingTokens: this.sanitize(sample.thinkingTokens),
        },
      })
      .catch((error: Error) => {
        this.logger.warn(`Failed to record LLM usage: ${error.message}`);
      });
  }

  /** SDKs report token counts as optional; store 0 rather than null/NaN. */
  private sanitize(value: number | undefined | null): number {
    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value as number))
      : 0;
  }
}
