import { CronExpressionParser } from 'cron-parser';

export function validateTimezone(timezone: string): void {
  // Intl throws on unknown IANA timezone names.
  new Intl.DateTimeFormat('en-US', { timeZone: timezone });
}

export function getNextRunAt(
  cronExpression: string,
  timezone: string,
  currentDate = new Date()
): Date {
  const expression = CronExpressionParser.parse(cronExpression, {
    currentDate,
    tz: timezone,
  });
  return expression.next().toDate();
}
