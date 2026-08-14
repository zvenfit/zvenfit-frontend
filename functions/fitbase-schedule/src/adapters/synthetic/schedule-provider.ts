import type { ScheduleItem, ScheduleProvider } from '../../types';

interface SyntheticScenario extends Omit<ScheduleItem, 'id' | 'date' | 'transfer'> {
  key: string;
  dayOffset: number;
  transferDayOffset?: number;
  transferTimeStart?: string;
  transferTimeEnd?: string;
}

const SYNTHETIC_SCENARIOS: readonly SyntheticScenario[] = [
  {
    key: 'group-training',
    dayOffset: 0,
    timeStart: '09:00',
    timeEnd: '10:00',
    duration: 60,
    title: 'Тест: групповая тренировка',
    description: 'Синтетическое занятие для проверки staging.',
    color: '#00d10e',
    trainers: [{ name: 'Тестовый тренер', photo: '' }],
    place: 'Тестовый зал',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: false,
    registrationClosed: false,
    registrationRequired: true,
    maxParticipants: 12,
  },
  {
    key: 'overlapping-training',
    dayOffset: 0,
    timeStart: '09:30',
    timeEnd: '10:30',
    duration: 60,
    title: 'Тест: пересекающееся занятие',
    description: 'Проверяет отображение параллельных занятий.',
    color: '#4da6ff',
    trainers: [{ name: 'Демо-инструктор', photo: '' }],
    place: 'Соседний тестовый зал',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: false,
    registrationClosed: false,
    registrationRequired: false,
    maxParticipants: null,
  },
  {
    key: 'kids-training',
    dayOffset: 1,
    timeStart: '16:00',
    timeEnd: '16:45',
    duration: 45,
    title: 'Тест: детская тренировка',
    description: 'Синтетический детский сценарий.',
    color: '#ffb020',
    trainers: [{ name: 'Тестовый детский тренер', photo: '' }],
    place: 'Тестовый зал',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'kids',
    cancelled: false,
    registrationClosed: false,
    registrationRequired: true,
    maxParticipants: 8,
  },
  {
    key: 'cancelled-training',
    dayOffset: 2,
    timeStart: '18:00',
    timeEnd: '19:00',
    duration: 60,
    title: 'Тест: отменённое занятие',
    description: 'Проверяет статус отмены.',
    color: '#dc3545',
    trainers: [{ name: 'Тестовый тренер', photo: '' }],
    place: 'Тестовый зал',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: true,
    registrationClosed: false,
    registrationRequired: true,
    maxParticipants: 10,
  },
  {
    key: 'closed-registration',
    dayOffset: 3,
    timeStart: '19:00',
    timeEnd: '20:00',
    duration: 60,
    title: 'Тест: запись закрыта',
    description: 'Проверяет закрытую регистрацию.',
    color: '#b949ff',
    trainers: [{ name: 'Демо-инструктор', photo: '' }],
    place: 'Тестовая студия',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: false,
    registrationClosed: true,
    registrationRequired: true,
    maxParticipants: 6,
  },
  {
    key: 'transferred-training',
    dayOffset: 4,
    timeStart: '11:00',
    timeEnd: '12:00',
    duration: 60,
    title: 'Тест: перенесённое занятие',
    description: 'Проверяет информацию о переносе.',
    color: '#00a0d1',
    trainers: [{ name: 'Тестовый тренер', photo: '' }],
    place: 'Тестовый зал',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: false,
    registrationClosed: false,
    registrationRequired: true,
    maxParticipants: 10,
    transferDayOffset: 5,
    transferTimeStart: '13:00',
    transferTimeEnd: '14:00',
  },
  {
    key: 'minimal-fields',
    dayOffset: 5,
    timeStart: '20:00',
    timeEnd: '21:00',
    duration: 60,
    title: 'Тест: без необязательных данных',
    description: '',
    color: '',
    trainers: [],
    place: '',
    club: 'ZvenFit Staging',
    type: 'group',
    ageType: 'adult',
    cancelled: false,
    registrationClosed: false,
    registrationRequired: false,
    maxParticipants: null,
  },
] as const;

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));

  return date.toISOString().slice(0, 10);
}

export function generateSyntheticSchedule(from: string, to: string): ScheduleItem[] {
  return SYNTHETIC_SCENARIOS.map(scenario => {
    const date = addDays(from, scenario.dayOffset);
    const transfer =
      scenario.transferDayOffset === undefined
        ? null
        : {
            date: addDays(from, scenario.transferDayOffset),
            timeStart: scenario.transferTimeStart || '',
            timeEnd: scenario.transferTimeEnd || '',
          };

    return {
      id: `fixture-${from}-${scenario.key}`,
      date,
      timeStart: scenario.timeStart,
      timeEnd: scenario.timeEnd,
      duration: scenario.duration,
      title: scenario.title,
      description: scenario.description,
      color: scenario.color,
      trainers: scenario.trainers.map(trainer => ({ ...trainer })),
      place: scenario.place,
      club: scenario.club,
      type: scenario.type,
      ageType: scenario.ageType,
      cancelled: scenario.cancelled,
      registrationClosed: scenario.registrationClosed,
      registrationRequired: scenario.registrationRequired,
      maxParticipants: scenario.maxParticipants,
      transfer,
    };
  }).filter(item => item.date >= from && item.date <= to);
}

export function createSyntheticScheduleProvider(): ScheduleProvider {
  return {
    async getSchedule(from, to) {
      return generateSyntheticSchedule(from, to);
    },
  };
}
