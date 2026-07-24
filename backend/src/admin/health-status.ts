export type HealthStatus = 'ok' | 'warn' | 'error';

/** Pure rollup used by AdminHealthService; kept testable without Prisma. */
export function rollupHealthStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('warn')) return 'warn';
  return 'ok';
}
