import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 30 * 1000;

export type SettingValueType = 'string' | 'number' | 'boolean';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /** All rows keyed by setting key; refreshed lazily, invalidated on write. */
  private cache: Map<string, Setting> | null = null;
  private cacheLoadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async get(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting ${key} not found`);
    return setting;
  }

  async create(data: {
    key: string;
    value: string;
    valueType: SettingValueType;
    description?: string;
  }) {
    const setting = await this.prisma.setting.create({ data });
    this.invalidate();
    return setting;
  }

  async update(
    key: string,
    data: { value?: string; valueType?: SettingValueType; description?: string },
  ) {
    await this.get(key);
    const setting = await this.prisma.setting.update({ where: { key }, data });
    this.invalidate();
    return setting;
  }

  async remove(key: string) {
    await this.get(key);
    await this.prisma.setting.delete({ where: { key } });
    this.invalidate();
    return { ok: true };
  }

  /**
   * Numeric setting with fallback: returns `fallback` when the row is missing
   * or its value is not a finite number, so a bad DB value can never break a
   * consumer. Reads go through a short-lived cache — cheap enough to call per
   * job without hitting the DB every time.
   */
  async getNumber(key: string, fallback: number): Promise<number> {
    const setting = await this.getCached(key);
    if (!setting) return fallback;

    const value = Number(setting.value);
    if (!Number.isFinite(value)) {
      this.logger.warn(
        `Setting ${key} has non-numeric value "${setting.value}", using fallback ${fallback}`,
      );
      return fallback;
    }
    return value;
  }

  /**
   * String setting with fallback: returns `fallback` when the row is missing
   * or blank. Used for admin-editable LLM system prompts, so an emptied value
   * silently restores the built-in default instead of sending an empty prompt.
   */
  async getString(key: string, fallback: string): Promise<string> {
    const setting = await this.getCached(key);
    const value = setting?.value?.trim();
    return value ? value : fallback;
  }

  private async getCached(key: string) {
    const now = Date.now();
    if (!this.cache || now - this.cacheLoadedAt > CACHE_TTL_MS) {
      const rows = await this.prisma.setting.findMany();
      this.cache = new Map(rows.map((row) => [row.key, row]));
      this.cacheLoadedAt = now;
    }
    return this.cache.get(key) ?? null;
  }

  private invalidate() {
    this.cache = null;
  }
}
