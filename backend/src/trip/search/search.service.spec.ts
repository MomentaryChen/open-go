import { tripConfig, parseSearchProvider } from '../trip.config';
import { SearchBlockedError } from './google-search.provider';
import { SearchService } from './search.service';
import type { SearchHit } from '../trip.types';

const googleHit: SearchHit = { url: 'https://example.com/google', title: 'G' };
const ddgHit: SearchHit = { url: 'https://example.com/ddg', title: 'D' };

function service(googleResult: SearchHit[] | Error, ddgResult: SearchHit[] | Error) {
  const google = {
    name: 'google',
    search: jest.fn(() =>
      googleResult instanceof Error
        ? Promise.reject(googleResult)
        : Promise.resolve(googleResult),
    ),
  };
  const duckduckgo = {
    name: 'duckduckgo',
    search: jest.fn(() =>
      ddgResult instanceof Error
        ? Promise.reject(ddgResult)
        : Promise.resolve(ddgResult),
    ),
  };
  return {
    google,
    duckduckgo,
    // The service only calls search() and reads name.
    search: new SearchService(google as never, duckduckgo as never),
  };
}

describe('parseSearchProvider', () => {
  it('defaults to google', () => {
    expect(parseSearchProvider(undefined)).toBe('google');
    expect(parseSearchProvider('')).toBe('google');
    expect(parseSearchProvider('nope')).toBe('google');
  });

  it('accepts duckduckgo aliases', () => {
    expect(parseSearchProvider('duckduckgo')).toBe('duckduckgo');
    expect(parseSearchProvider('DDG')).toBe('duckduckgo');
  });
});

describe('SearchService', () => {
  const original = tripConfig.searchProvider;

  afterEach(() => {
    tripConfig.searchProvider = original;
  });

  it('uses DuckDuckGo only when that engine is selected', async () => {
    tripConfig.searchProvider = 'duckduckgo';
    const { search, google, duckduckgo } = service([googleHit], [ddgHit]);

    await expect(search.search('kyoto', 5)).resolves.toEqual({
      hits: [ddgHit],
      provider: 'duckduckgo',
      degraded: false,
    });
    expect(google.search).not.toHaveBeenCalled();
    expect(duckduckgo.search).toHaveBeenCalledWith('kyoto', 5);
  });

  it('falls back to DuckDuckGo when Google is blocked', async () => {
    tripConfig.searchProvider = 'google';
    const { search, duckduckgo } = service(
      new SearchBlockedError('captcha'),
      [ddgHit],
    );

    await expect(search.search('osaka', 3)).resolves.toEqual({
      hits: [ddgHit],
      provider: 'duckduckgo',
      degraded: true,
    });
    expect(duckduckgo.search).toHaveBeenCalled();
  });
});
