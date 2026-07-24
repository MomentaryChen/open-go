import {
  hostMatches,
  hostOverride,
  isHostBlocked,
  normalizeHost,
  STATIC_BLOCKED_HOSTS,
} from './host-policy';

describe('normalizeHost', () => {
  it('strips www and lowercases', () => {
    expect(normalizeHost('WWW.Example.COM')).toBe('example.com');
  });

  it('accepts a full URL', () => {
    expect(normalizeHost('https://www.blog.example.com/path?q=1')).toBe(
      'blog.example.com',
    );
  });

  it('rejects bare words and empty input', () => {
    expect(normalizeHost('localhost')).toBeNull();
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('not a host')).toBeNull();
  });
});

describe('hostMatches', () => {
  it('matches exact and subdomain', () => {
    expect(hostMatches('facebook.com', 'facebook.com')).toBe(true);
    expect(hostMatches('m.facebook.com', 'facebook.com')).toBe(true);
    expect(hostMatches('notfacebook.com', 'facebook.com')).toBe(false);
  });
});

describe('isHostBlocked', () => {
  const staticBlocked = STATIC_BLOCKED_HOSTS;

  it('allowlist wins over static and auto blocks', () => {
    expect(
      isHostBlocked('facebook.com', {
        allowlist: ['facebook.com'],
        denylist: [],
        unreliable: ['facebook.com'],
        staticBlocked,
      }),
    ).toBe(false);
  });

  it('denylist blocks even when not auto-unreliable', () => {
    expect(
      isHostBlocked('spam.example.com', {
        allowlist: [],
        denylist: ['spam.example.com'],
        unreliable: [],
        staticBlocked,
      }),
    ).toBe(true);
  });

  it('falls through to static then unreliable (exact host only)', () => {
    expect(
      isHostBlocked('youtube.com', {
        allowlist: [],
        denylist: [],
        unreliable: [],
        staticBlocked,
      }),
    ).toBe(true);
    expect(
      isHostBlocked('broken.news', {
        allowlist: [],
        denylist: [],
        unreliable: ['broken.news'],
        staticBlocked,
      }),
    ).toBe(true);
    // Sibling subdomain of an unreliable apex must still be collectable.
    expect(
      isHostBlocked('ok.broken.news', {
        allowlist: [],
        denylist: [],
        unreliable: ['broken.news'],
        staticBlocked,
      }),
    ).toBe(false);
    expect(
      isHostBlocked('good.example.com', {
        allowlist: [],
        denylist: [],
        unreliable: [],
        staticBlocked,
      }),
    ).toBe(false);
  });
});

describe('hostOverride', () => {
  it('reports allow / deny / null', () => {
    expect(
      hostOverride('a.com', { allowlist: ['a.com'], denylist: [] }),
    ).toBe('allow');
    expect(
      hostOverride('b.com', { allowlist: [], denylist: ['b.com'] }),
    ).toBe('deny');
    expect(hostOverride('c.com', { allowlist: [], denylist: [] })).toBeNull();
  });
});
