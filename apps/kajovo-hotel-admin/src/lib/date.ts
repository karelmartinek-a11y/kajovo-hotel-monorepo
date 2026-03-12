export function formatDateInTimeZone(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export function currentDateForTimeZone(
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  return formatDateInTimeZone(now, timeZone);
}
