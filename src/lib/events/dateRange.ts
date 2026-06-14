import type { ShowEvent } from '../../types/domain';

export function formatEventPeriod(event: Pick<ShowEvent, 'startDate' | 'endDate'>) {
  return event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} to ${event.endDate}`;
}
