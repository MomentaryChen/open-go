import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  DEFAULT_COMPOSER_PROMPT,
  DEFAULT_PLANNER_PROMPT,
} from '../trip/prompts';
import { AdminGuard } from './admin.guard';
import { SettingsService, SettingValueType } from './settings.service';

type CreateSettingDto = {
  key?: string;
  value?: string;
  valueType?: string;
  description?: string;
};

type UpdateSettingDto = {
  value?: string;
  valueType?: string;
  description?: string;
};

const KEY_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;
const VALUE_TYPES: SettingValueType[] = ['string', 'number', 'boolean'];

@Controller('settings')
@UseGuards(AdminGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  /**
   * Built-in prompt defaults for the admin Prompt editor's reset button.
   * Must be declared before the :key route so "prompt-defaults" is not
   * treated as a setting key.
   */
  @Get('prompt-defaults')
  promptDefaults() {
    return {
      planner: DEFAULT_PLANNER_PROMPT,
      composer: DEFAULT_COMPOSER_PROMPT,
    };
  }

  /**
   * Which LLM providers have an API key configured, so the admin UI can
   * disable the ones that would fail at generation time. Also declared
   * before :key. Reports presence only — never the key values.
   */
  @Get('llm-providers')
  llmProviders() {
    return {
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  }

  /**
   * Recent changes across every key, for the settings page's audit panel.
   * Declared before :key so "history" is not treated as a setting key.
   */
  @Get('history')
  recentHistory(@Query('limit') limit?: string) {
    return this.settings.recentHistory(this.parseLimit(limit, 50));
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.settings.get(key);
  }

  /** Version history for one key, newest first. */
  @Get(':key/history')
  history(@Param('key') key: string, @Query('limit') limit?: string) {
    return this.settings.history(key, this.parseLimit(limit, 50));
  }

  /** Restore the value recorded by a history entry. */
  @Post(':key/revert/:historyId')
  revert(
    @Param('key') key: string,
    @Param('historyId') historyId: string,
  ) {
    return this.settings.revert(key, historyId);
  }

  @Post()
  async create(@Body() body: CreateSettingDto) {
    const key = body?.key?.trim();
    if (!key) throw new BadRequestException('key is required');
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'key may only contain letters, digits, ".", "_", "-" (max 100 chars)',
      );
    }

    const valueType = this.parseValueType(body?.valueType ?? 'string');
    const value = this.parseValue(body?.value, valueType);
    const description = this.parseDescription(body?.description);

    try {
      return await this.settings.create({ key, value, valueType, description });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Setting ${key} already exists`);
      }
      throw error;
    }
  }

  @Patch(':key')
  async update(@Param('key') key: string, @Body() body: UpdateSettingDto) {
    if (
      body?.value === undefined &&
      body?.valueType === undefined &&
      body?.description === undefined
    ) {
      throw new BadRequestException('nothing to update');
    }

    // Validate the value against the requested (or existing) type.
    const current = await this.settings.get(key);
    const valueType = this.parseValueType(
      body?.valueType ?? current.valueType,
    );
    const value =
      body?.value === undefined
        ? undefined
        : this.parseValue(body.value, valueType);
    const description =
      body?.description === undefined
        ? undefined
        : this.parseDescription(body.description);

    return this.settings.update(key, { value, valueType, description });
  }

  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.settings.remove(key);
  }

  private parseLimit(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private parseValueType(raw: string): SettingValueType {
    if (!VALUE_TYPES.includes(raw as SettingValueType)) {
      throw new BadRequestException(
        `valueType must be one of: ${VALUE_TYPES.join(', ')}`,
      );
    }
    return raw as SettingValueType;
  }

  private parseValue(raw: unknown, valueType: SettingValueType): string {
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new BadRequestException('value is required');
    }
    const value = raw.trim();

    if (valueType === 'number' && !Number.isFinite(Number(value))) {
      throw new BadRequestException('value must be a finite number');
    }
    if (valueType === 'boolean' && value !== 'true' && value !== 'false') {
      throw new BadRequestException('value must be "true" or "false"');
    }
    // 8000 leaves room for admin-edited LLM system prompts.
    if (value.length > 8000) {
      throw new BadRequestException('value must be 8000 characters or fewer');
    }
    return value;
  }

  private parseDescription(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'string') {
      throw new BadRequestException('description must be a string');
    }
    if (raw.length > 500) {
      throw new BadRequestException(
        'description must be 500 characters or fewer',
      );
    }
    return raw;
  }
}
