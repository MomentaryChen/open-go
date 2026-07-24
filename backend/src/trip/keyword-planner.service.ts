import { Inject, Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_PLANNER_PROMPT } from './prompts';
import { STRUCTURED_LLM } from './llm/llm.types';
import type { StructuredLlm } from './llm/llm.types';
import {
  EMPTY_PREFERENCES,
  describePreferences,
  type TripPreferences,
} from './trip-preferences';

const PlanSchema = z.object({
  destination: z
    .string()
    .describe('The travel destination inferred from the keyword'),
  destinationCountryCode: z
    .string()
    .describe(
      "ISO 3166-1 alpha-2 country code of the destination, e.g. JP for 北海道, TW for 台南",
    ),
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

  async plan(
    keyword: string,
    preferences: TripPreferences = EMPTY_PREFERENCES,
  ): Promise<TripPlan> {
    const system = await this.settings.getString(
      'trip.plannerSystemPrompt',
      DEFAULT_PLANNER_PROMPT,
    );

    const parts: Array<{ text: string }> = [
      { text: `Traveller keyword: ${keyword}` },
    ];
    const constraints = describePreferences(preferences);
    if (constraints) {
      parts.push({
        text:
          "Traveller's explicit preferences (honour these over anything inferred " +
          `from the keyword; craft queries that reflect them):\n${constraints}`,
      });
    }

    const plan = await this.llm.generate({
      system,
      parts,
      schema: PlanSchema,
      maxOutputTokens: 4000,
      effort: 'medium',
    });

    // Explicit constraints win over the model's inference: an emptied field
    // keeps the planner's guess, a set one replaces it.
    const resolved: TripPlan = {
      ...plan,
      durationDays: preferences.durationDays ?? plan.durationDays,
    };

    this.logger.log(
      `Planned ${resolved.queries.length} queries for "${keyword}"` +
        (constraints ? ' with explicit preferences' : ''),
    );
    return resolved;
  }
}
