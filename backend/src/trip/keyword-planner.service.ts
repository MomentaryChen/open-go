import { Inject, Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_PLANNER_PROMPT } from './prompts';
import { STRUCTURED_LLM } from './llm/llm.types';
import type { StructuredLlm } from './llm/llm.types';

const PlanSchema = z.object({
  destination: z
    .string()
    .describe('The travel destination inferred from the keyword'),
  durationDays: z
    .number()
    .describe('Trip length in days; infer a sensible default when unstated'),
  travelStyle: z
    .string()
    .describe('Traveller profile, e.g. family / couple / backpacker'),
  outputLanguage: z
    .string()
    .describe(
      "BCP-47 tag of the language the traveller wrote the keyword in, e.g. zh-TW, en, ja, ko — the final itinerary will be written in this language",
    ),
  queries: z
    .array(
      z.object({
        query: z.string().describe('A search engine query string'),
        intent: z.enum([
          'attraction',
          'food',
          'transport',
          'accommodation',
          'itinerary',
        ]),
        language: z
          .string()
          .describe('Language tag of the query, e.g. zh-TW or en'),
      }),
    )
    .describe('6 to 10 complementary search queries covering every intent'),
});

export type TripPlan = z.infer<typeof PlanSchema>;


@Injectable()
export class KeywordPlannerService {
  private readonly logger = new Logger(KeywordPlannerService.name);

  constructor(
    @Inject(STRUCTURED_LLM) private readonly llm: StructuredLlm,
    private readonly settings: SettingsService,
  ) {}

  async plan(keyword: string): Promise<TripPlan> {
    const system = await this.settings.getString(
      'trip.plannerSystemPrompt',
      DEFAULT_PLANNER_PROMPT,
    );
    const plan = await this.llm.generate({
      system,
      parts: [{ text: `Traveller keyword: ${keyword}` }],
      schema: PlanSchema,
      maxOutputTokens: 4000,
      effort: 'medium',
    });

    this.logger.log(`Planned ${plan.queries.length} queries for "${keyword}"`);
    return plan;
  }
}
