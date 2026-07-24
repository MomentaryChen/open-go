import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  HostOverride,
  HostPolicyLists,
  normalizeHost,
} from './host-policy';

export const HOST_ALLOWLIST_KEY = 'trip.hostAllowlist';
export const HOST_DENYLIST_KEY = 'trip.hostDenylist';

const ALLOWLIST_DESCRIPTION =
  'JSON array of hostnames the crawler must never skip (overrides auto-block and the static blocklist).';
const DENYLIST_DESCRIPTION =
  'JSON array of hostnames the crawler must always skip (force-block junk sources).';

const MAX_LIST_SIZE = 500;

export type HostOverrideAction = 'allow' | 'deny' | 'clear';

@Injectable()
export class HostPolicyService {
  constructor(private readonly settings: SettingsService) {}

  async getLists(): Promise<HostPolicyLists> {
    const [allowRaw, denyRaw] = await Promise.all([
      this.settings.getString(HOST_ALLOWLIST_KEY, '[]'),
      this.settings.getString(HOST_DENYLIST_KEY, '[]'),
    ]);
    return {
      allowlist: this.parseList(allowRaw),
      denylist: this.parseList(denyRaw),
    };
  }

  /** Replace one or both lists. Omitted fields are left unchanged. */
  async saveLists(input: {
    allowlist?: string[];
    denylist?: string[];
  }): Promise<HostPolicyLists> {
    if (input.allowlist === undefined && input.denylist === undefined) {
      return this.getLists();
    }

    const current = await this.getLists();
    let allowlist =
      input.allowlist !== undefined
        ? this.normalizeList(input.allowlist)
        : current.allowlist;
    let denylist =
      input.denylist !== undefined
        ? this.normalizeList(input.denylist)
        : current.denylist;

    // Keep lists mutually exclusive (allow wins in isHostBlocked, but operators
    // should not be able to park the same host on both).
    if (input.allowlist !== undefined && input.denylist !== undefined) {
      const overlap = allowlist.filter((host) => denylist.includes(host));
      if (overlap.length > 0) {
        throw new BadRequestException(
          `host cannot be on both allowlist and denylist: ${overlap.join(', ')}`,
        );
      }
    } else if (input.allowlist !== undefined) {
      denylist = denylist.filter((host) => !allowlist.includes(host));
    } else {
      allowlist = allowlist.filter((host) => !denylist.includes(host));
    }

    await this.writeList(HOST_ALLOWLIST_KEY, allowlist, ALLOWLIST_DESCRIPTION);
    await this.writeList(HOST_DENYLIST_KEY, denylist, DENYLIST_DESCRIPTION);
    return { allowlist, denylist };
  }

  /**
   * Set a single-host override. `allow` and `deny` are mutually exclusive —
   * writing one removes the host from the other list. `clear` removes it from both.
   */
  async setOverride(
    rawHost: string,
    action: HostOverrideAction,
  ): Promise<{ host: string; override: HostOverride; lists: HostPolicyLists }> {
    const host = normalizeHost(rawHost);
    if (!host) {
      throw new BadRequestException(
        'host must be a valid hostname (e.g. example.com)',
      );
    }
    if (action !== 'allow' && action !== 'deny' && action !== 'clear') {
      throw new BadRequestException('action must be allow, deny, or clear');
    }

    const lists = await this.getLists();
    let allowlist = lists.allowlist.filter((entry) => entry !== host);
    let denylist = lists.denylist.filter((entry) => entry !== host);

    if (action === 'allow') {
      allowlist = [...allowlist, host].sort();
    } else if (action === 'deny') {
      denylist = [...denylist, host].sort();
    }

    const next = await this.saveLists({ allowlist, denylist });
    return {
      host,
      override: action === 'clear' ? null : action,
      lists: next,
    };
  }

  private async writeList(
    key: string,
    list: string[],
    description: string,
  ): Promise<void> {
    if (list.length > MAX_LIST_SIZE) {
      throw new BadRequestException(
        `${key} may contain at most ${MAX_LIST_SIZE} hosts`,
      );
    }
    await this.settings.setString(key, JSON.stringify(list), description);
  }

  private normalizeList(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('host list must be a JSON array of strings');
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'string') {
        throw new BadRequestException('host list entries must be strings');
      }
      const host = normalizeHost(entry);
      if (!host) {
        throw new BadRequestException(`invalid host: ${entry}`);
      }
      if (seen.has(host)) continue;
      seen.add(host);
      out.push(host);
    }
    return out.sort();
  }

  private parseList(raw: string): string[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: string[] = [];
      for (const entry of parsed) {
        if (typeof entry !== 'string') continue;
        const host = normalizeHost(entry);
        if (host) out.push(host);
      }
      return [...new Set(out)].sort();
    } catch {
      return [];
    }
  }
}
