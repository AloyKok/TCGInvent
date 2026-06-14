import type { ShowEvent } from '../../types/domain';

export function getLocalDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function formatEventPeriod(event: Pick<ShowEvent, 'startDate' | 'endDate'>) {
  return event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} to ${event.endDate}`;
}
