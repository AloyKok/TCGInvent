import type { ShowEvent, Transaction } from '../../types/domain';

export type SaleMode = 'daily' | 'show';

export function getLocalDateKey(value: string | Date = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function getLocalMonthKey(value: string | Date = new Date()) {
  return getLocalDateKey(value).slice(0, 7);
}

export function getRevenueMonth(
  transaction: Pick<Transaction, 'createdAt' | 'eventId'>,
  eventsById: ReadonlyMap<string, Pick<ShowEvent, 'startDate'>>
) {
  if (transaction.eventId) {
    const show = eventsById.get(transaction.eventId);
    if (show) return show.startDate.slice(0, 7);
  }
  return getLocalMonthKey(transaction.createdAt);
}

export function formatMonthLabel(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1));
}

export function matchesSaleScope(transaction: Pick<Transaction, 'eventId'>, scope: string) {
  if (!scope) return true;
  if (scope === 'daily') return !transaction.eventId;
  if (scope === 'shows') return Boolean(transaction.eventId);
  return transaction.eventId === scope;
}
