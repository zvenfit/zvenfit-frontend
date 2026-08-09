import type { FitbaseItem, ScheduleItem, Trainer } from '../types';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function trainerValue(value: unknown): Trainer | null {
  return value !== null && typeof value === 'object' ? (value as Trainer) : null;
}

function mapTrainer(value: unknown): { name: string; photo: string } | null {
  const trainer = trainerValue(value);
  if (!trainer) {
    return null;
  }

  let name = '';
  if (trainer.full_name) {
    name = String(trainer.full_name).trim();
  } else {
    name = [trainer.surname, trainer.name, trainer.patronymic].filter(Boolean).map(String).join(' ').trim();
  }

  return name ? { name, photo: stringValue(trainer.photo) } : null;
}

export function mapScheduleItem(item: FitbaseItem): ScheduleItem {
  const training = item.training || {};
  const place = item.place || {};
  const transfer = item.transfer_event || null;

  return {
    id: item.id,
    date: item.date || '',
    timeStart: item.time_start || '',
    timeEnd: item.time_end || '',
    duration: item.duration ?? null,
    title: training.name || 'Занятие',
    description: training.description || '',
    color: training.color || '',
    trainers: Array.isArray(item.trainers)
      ? item.trainers.map(mapTrainer).filter((trainer): trainer is { name: string; photo: string } => trainer !== null)
      : [],
    place: place.name || '',
    club: item.club?.name || '',
    type: item.event_type || '',
    ageType: item.age_type || '',
    cancelled: Boolean(item.cancel),
    registrationClosed: Boolean(item.stop_registration),
    registrationRequired: Boolean(item.need_register),
    maxParticipants: item.max_register ?? null,
    transfer: transfer
      ? {
          date: transfer.date || '',
          timeStart: transfer.time_start || '',
          timeEnd: transfer.time_end || '',
        }
      : null,
  };
}

export function shouldIncludeItem(item: unknown): item is FitbaseItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const scheduleItem = item as FitbaseItem;

  return scheduleItem.event_type !== 'rent' && scheduleItem.is_archive !== 1;
}

export function sortScheduleItems(items: ScheduleItem[]): ScheduleItem[] {
  return items.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return left.timeStart.localeCompare(right.timeStart);
  });
}
