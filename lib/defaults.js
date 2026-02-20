export const CACHE_MAX_AGE = 180  // 3 minutes
export const LOCK_MAX_AGE = 30   // stale lock timeout

export const DEFAULT_CONFIG = {
  fields: ['model', 'dir', 'git', 'tokens', 'cost', 'ctxBar', 'rateBar', 'resetTimes'],
  separator: '›',
  colorScheme: 'default',
  barStyle: 'thin',
  thresholds: { warn: 50, danger: 80 },
}
