import { rollupHealthStatus } from './health-status';

describe('rollupHealthStatus', () => {
  it('returns ok when every status is ok', () => {
    expect(rollupHealthStatus(['ok', 'ok', 'ok'])).toBe('ok');
  });

  it('returns warn when any status warns and none error', () => {
    expect(rollupHealthStatus(['ok', 'warn', 'ok'])).toBe('warn');
  });

  it('returns error when any status errors', () => {
    expect(rollupHealthStatus(['warn', 'error', 'ok'])).toBe('error');
  });
});
