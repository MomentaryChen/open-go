/**
 * Pure host-policy helpers shared by crawl filtering and the admin console.
 * Hostname matching strips a leading `www.` and is case-insensitive.
 */

export type HostOverride = 'allow' | 'deny' | null;

export type HostPolicyLists = {
  allowlist: string[];
  denylist: string[];
};

/**
 * Hosts that consistently reject the crawler (login walls, JS-only shells).
 * Confirmed by crawl history: facebook 0/7, youtube 0/5 fetched. Skipping them
 * at URL-selection time keeps all document slots for fetchable pages.
 * Operators can temporarily override via trip.hostAllowlist / trip.hostDenylist.
 */
export const STATIC_BLOCKED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'threads.com',
  'threads.net',
  'x.com',
  'twitter.com',
  'reddit.com',
] as const;

/** Normalize a hostname or URL-ish input to a bare host without www. */
export function normalizeHost(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  let host = trimmed;
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  } else {
    // Strip path / query / port if an operator pasted a partial URL.
    host = host.split('/')[0]?.split('?')[0]?.split('#')[0] ?? '';
    host = host.replace(/:\d+$/, '');
  }

  host = host.replace(/^www\./, '').replace(/\.+$/, '');
  if (!host || host.includes(' ') || !host.includes('.')) return null;
  // Labels: letters, digits, hyphen; at least one dot.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  return host;
}

/** True when `host` equals `blocked` or is a subdomain of it. */
export function hostMatches(host: string, blocked: string): boolean {
  return host === blocked || host.endsWith(`.${blocked}`);
}

/**
 * Decide whether a host should be skipped at URL-selection time.
 * Priority: allowlist (never block) → denylist (always block) → static →
 * auto-unreliable. Allow/deny/static use subdomain matching; unreliable hosts
 * are exact-match only (same as the pre-policy crawler), so a failing apex
 * does not silence healthy sibling subdomains.
 */
export function isHostBlocked(
  host: string,
  opts: {
    allowlist: Iterable<string>;
    denylist: Iterable<string>;
    unreliable: Iterable<string>;
    staticBlocked: readonly string[];
  },
): boolean {
  const allow = [...opts.allowlist];
  if (allow.some((entry) => hostMatches(host, entry))) return false;

  const deny = [...opts.denylist];
  if (deny.some((entry) => hostMatches(host, entry))) return true;

  if (opts.staticBlocked.some((entry) => hostMatches(host, entry))) return true;

  for (const entry of opts.unreliable) {
    if (host === entry) return true;
  }
  return false;
}

/** True when any list entry matches the host (exact or subdomain). */
export function listCoversHost(host: string, list: Iterable<string>): boolean {
  return [...list].some((entry) => hostMatches(host, entry));
}

/** Manual override for a host, if any (exact list membership after normalize). */
export function hostOverride(
  host: string,
  lists: HostPolicyLists,
): HostOverride {
  if (lists.allowlist.includes(host)) return 'allow';
  if (lists.denylist.includes(host)) return 'deny';
  return null;
}
