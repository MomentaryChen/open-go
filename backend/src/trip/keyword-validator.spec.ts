import { validateKeyword } from './keyword-validator';

describe('validateKeyword', () => {
  const ok = (raw: unknown) => {
    const result = validateKeyword(raw);
    expect(result).toEqual({ ok: true });
  };

  const rejected = (raw: unknown, code: string) => {
    const result = validateKeyword(raw);
    expect(result).toMatchObject({ ok: false, code });
  };

  describe('valid keywords', () => {
    it.each([
      '大阪三天兩夜親子自由行',
      'Osaka 3-day family trip',
      '京都賞楓五日深度旅遊',
      'Seoul 4 days shopping trip',
      '台南美食',
      'AB',
    ])('accepts "%s"', (kw) => ok(kw));
  });

  describe('KEYWORD_REQUIRED', () => {
    it.each([undefined, null, '', '   ', 42, {}])(
      'rejects %j',
      (val) => rejected(val, 'KEYWORD_REQUIRED'),
    );
  });

  describe('KEYWORD_TOO_SHORT', () => {
    it('rejects a single character', () => rejected('A', 'KEYWORD_TOO_SHORT'));
  });

  describe('KEYWORD_TOO_LONG', () => {
    it('rejects strings over 200 characters', () =>
      rejected('A'.repeat(201), 'KEYWORD_TOO_LONG'));
  });

  describe('KEYWORD_HAS_URL', () => {
    it.each([
      'https://example.com',
      'visit http://google.com',
      'check www.booking.com',
      'go to example.com please',
      'travel.com.tw guide',
    ])('rejects "%s"', (kw) => rejected(kw, 'KEYWORD_HAS_URL'));
  });

  describe('KEYWORD_HAS_HTML', () => {
    it.each([
      '<script>alert(1)</script>',
      '<div>hello</div>',
      'test <img src=x>',
    ])('rejects "%s"', (kw) => rejected(kw, 'KEYWORD_HAS_HTML'));
  });

  describe('KEYWORD_NO_WORDS', () => {
    it.each(['!!!', '---', '...', '☆★☆'])(
      'rejects "%s" (no word characters)',
      (kw) => rejected(kw, 'KEYWORD_NO_WORDS'),
    );
  });

  describe('KEYWORD_CONTROL_CHARS', () => {
    it('rejects strings with control characters', () =>
      rejected('hello\x00world', 'KEYWORD_CONTROL_CHARS'));
  });

  describe('KEYWORD_EXCESSIVE_SPECIAL', () => {
    it('rejects when more than half of non-space chars are special', () =>
      rejected('A!!!???###', 'KEYWORD_EXCESSIVE_SPECIAL'));
  });

  describe('edge cases', () => {
    it('allows emoji mixed with text', () => ok('🎡 大阪親子遊'));
    it('allows numbers mixed with text', () => ok('5天4夜'));
    it('allows Korean', () => ok('서울 여행'));
    it('allows Japanese', () => ok('東京ディズニーランド'));
    it('trims leading/trailing whitespace', () => ok('  京都  '));
  });
});
