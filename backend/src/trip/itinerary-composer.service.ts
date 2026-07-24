import { Inject, Injectable, Logger } from '@nestjs/common';
import * as z from 'zod/v4';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_COMPOSER_PROMPT } from './prompts';
import { STRUCTURED_LLM } from './llm/llm.types';
import type { StructuredLlm } from './llm/llm.types';
import { TripPlan } from './keyword-planner.service';
import { tripConfig } from './trip.config';

const ItinerarySchema = z.object({
  title: z.string(),
  destination: z.string(),
  durationDays: z.number(),
  summary: z.string().describe('Two to four sentences describing the trip'),
  bestSeason: z.string(),
  budgetEstimate: z.string().describe('Rough per-person budget with currency'),
  days: z.array(
    z.object({
      day: z.number(),
      theme: z.string(),
      stay: z
        .object({
          area: z
            .string()
            .describe(
              'Neighbourhood / district where the traveller sleeps this night, e.g. "小樽運河周邊" — an area, never a specific hotel',
            ),
          latitude: z
            .number()
            .nullable()
            .describe("Approximate WGS84 latitude of the area's center"),
          longitude: z.number().nullable().describe('Approximate WGS84 longitude'),
          reason: z
            .string()
            .describe(
              "Why this area: proximity to tonight's last stop and tomorrow's first stop, transport links",
            ),
        })
        .nullable()
        .describe(
          'Which area this night is spent in; null only on the final day (departure day)',
        ),
      items: z.array(
        z.object({
          time: z.string().describe('24h start time, e.g. 09:00'),
          name: z.string(),
          category: z.enum([
            'attraction',
            'food',
            'shopping',
            'transport',
            'hotel',
            'other',
          ]),
          description: z.string(),
          address: z
            .string()
            .nullable()
            .describe(
              'Street address of the place as stated in the documents; null when no document gives one — never invent an address',
            ),
          durationMinutes: z.number(),
          tips: z.string(),
          latitude: z
            .number()
            .nullable()
            .describe(
              'Approximate WGS84 latitude of the place; null when the item is not one fixed place (e.g. a multi-stop transfer)',
            ),
          longitude: z
            .number()
            .nullable()
            .describe('Approximate WGS84 longitude; null when latitude is null'),
          sourceUrls: z
            .array(z.string())
            .describe('URLs of the supplied documents backing this item'),
        }),
      ),
    }),
  ),
  tips: z.array(z.string()).describe('Practical trip-wide advice'),
  references: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;

export type ComposerDocument = {
  url: string;
  title: string | null;
  content: string | null;
};


/**
 * The itinerary is written in the language the traveller typed their keyword
 * in (detected by the planner), regardless of the source documents' language.
 */
function languageRule(outputLanguage: string) {
  return `\n- Write all user-facing text in ${outputLanguage}, even when the source documents are in another language.`;
}

@Injectable()
export class ItineraryComposerService {
  private readonly logger = new Logger(ItineraryComposerService.name);

  constructor(
    @Inject(STRUCTURED_LLM) private readonly llm: StructuredLlm,
    private readonly settings: SettingsService,
  ) {}

  async compose(
    keyword: string,
    plan: TripPlan,
    documents: ComposerDocument[],
  ): Promise<Itinerary> {
    const corpus = this.buildCorpus(documents);
    if (!corpus.text) {
      throw new Error(
        'No crawled document content available to compose an itinerary',
      );
    }

    const basePrompt = await this.settings.getString(
      'trip.composerSystemPrompt',
      DEFAULT_COMPOSER_PROMPT,
    );
    const itinerary = await this.llm.generate({
      // The language rule is always appended so an admin-edited prompt cannot
      // accidentally drop input-language matching.
      system: basePrompt + languageRule(plan.outputLanguage || 'zh-TW'),
      parts: [
        { text: `<documents>\n${corpus.text}\n</documents>`, cacheable: true },
        {
          text: [
            `Traveller keyword: ${keyword}`,
            `Destination: ${plan.destination}`,
            `Planned length: ${plan.durationDays} days`,
            `Traveller style: ${plan.travelStyle}`,
            '',
            `Build a ${plan.durationDays}-day itinerary from the ${corpus.used} documents above.`,
          ].join('\n'),
        },
      ],
      schema: ItinerarySchema,
      // Gemini counts thinking tokens against this budget, and a multi-day
      // itinerary in Traditional Chinese is large; 16k truncated mid-JSON.
      maxOutputTokens: 60000,
      effort: 'high',
    });

    this.logger.log(
      `Composed ${itinerary.days.length}-day itinerary from ${corpus.used} documents`,
    );
    return itinerary;
  }

  private buildCorpus(documents: ComposerDocument[]) {
    const parts: string[] = [];
    let budget = tripConfig.maxPromptCharsTotal;
    let used = 0;

    for (const document of documents) {
      if (!document.content) continue;
      const body = document.content.slice(
        0,
        tripConfig.maxPromptCharsPerDocument,
      );
      const block = `### ${document.title ?? document.url}\nURL: ${document.url}\n${body}`;
      if (block.length > budget) break;
      budget -= block.length;
      used += 1;
      parts.push(block);
    }

    return { text: parts.join('\n\n---\n\n'), used };
  }
}
