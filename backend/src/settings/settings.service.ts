import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
    await this.record('create', setting.key, null, setting);
    return setting;
  }

  async update(
    key: string,
    data: { value?: string; valueType?: SettingValueType; description?: string },
  ) {
    const before = await this.get(key);
    const setting = await this.prisma.setting.update({ where: { key }, data });
    this.invalidate();
    await this.record('update', key, before.value, setting);
    return setting;
  }

  async remove(key: string) {
    const before = await this.get(key);
    await this.prisma.setting.delete({ where: { key } });
    this.invalidate();
    await this.record('delete', key, before.value, null, before.valueType);
    return { ok: true };
  }

  /**
   * Create the row when missing, otherwise update its value — for callers that
   * persist a fixed set of known keys (e.g. affiliate IDs) and don't care
   * whether the row already existed. Every write is audited via record().
   */
  async setString(key: string, value: string, description?: string) {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (existing) {
      const setting = await this.prisma.setting.update({
        where: { key },
        data: { value, description },
      });
      this.invalidate();
      await this.record('update', key, existing.value, setting);
      return setting;
    }
    const setting = await this.prisma.setting.create({
      data: { key, value, valueType: 'string', description },
    });
    this.invalidate();
    await this.record('create', key, null, setting);
    return setting;
  }

  /** Audit trail for one key, newest first. */
  async history(key: string, limit = 50) {
    return this.prisma.settingHistory.findMany({
      where: { key },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Audit trail across all keys, for the settings page's recent-changes view. */
  async recentHistory(limit = 50) {
    return this.prisma.settingHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * Restore the value a history entry recorded. For a delete entry there is no
   * "after" value, so its pre-delete value is restored instead — which also
   * re-creates the row when it is currently missing. The revert is itself
   * recorded, so rolling back never erases the trail.
   */
  async revert(key: string, historyId: string) {
    const entry = await this.prisma.settingHistory.findUnique({
      where: { id: historyId },
    });
    if (!entry || entry.key !== key) {
      throw new NotFoundException(`History entry ${historyId} not found`);
    }

    const target = entry.newValue ?? entry.oldValue;
    if (target === null) {
      throw new BadRequestException('This entry has no value to restore');
    }

    const current = await this.prisma.setting.findUnique({ where: { key } });
    const valueType = entry.valueType ?? current?.valueType ?? 'string';

    const setting = current
      ? await this.prisma.setting.update({
          where: { key },
          data: { value: target, valueType },
        })
      : await this.prisma.setting.create({
          data: {
            key,
            value: target,
            valueType,
            description: entry.description ?? undefined,
          },
        });

    this.invalidate();
    await this.record('revert', key, current?.value ?? null, setting);
    return setting;
  }

  /**
   * Appends an audit row. Never throws into the caller: losing an audit entry
   * must not fail the settings write the operator actually asked for.
   */
  private async record(
    action: 'create' | 'update' | 'delete' | 'revert',
    key: string,
    oldValue: string | null,
    after: { value: string; valueType: string; description: string | null } | null,
    fallbackValueType?: string,
  ) {
    try {
      await this.prisma.settingHistory.create({
        data: {
          key,
          action,
          oldValue,
          newValue: after?.value ?? null,
          valueType: after?.valueType ?? fallbackValueType ?? null,
          description: after?.description ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record ${action} history for ${key}: ${(error as Error).message}`,
      );
    }
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
