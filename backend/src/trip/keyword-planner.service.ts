import { Inject, Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { SettingsService } from '../settings/settings.service';
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

/** Built-in default; admins can override it via the trip.plannerSystemPrompt setting. */
export const DEFAULT_PLANNER_PROMPT = `You break a traveller's keyword down into search engine queries for a research crawler.

Rules:
- Detect the language the traveller wrote the keyword in and report it as outputLanguage (BCP-47, e.g. zh-TW, en, ja). Written Chinese without simplified characters should be treated as zh-TW.
- Produce 6 to 10 queries, covering all five intents: attraction, food, transport, accommodation, itinerary.
- Mix languages: at least two queries in the destination's local language, at least two in the traveller's own language, and at least two in English, so the crawler reaches local blogs, the traveller's community, and international guides.
- Write queries the way a real person types them into Google — no boolean operators, no quotes, no site: filters.
- Prefer queries that surface recent, specific, first-hand articles over generic landing pages.`;

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
