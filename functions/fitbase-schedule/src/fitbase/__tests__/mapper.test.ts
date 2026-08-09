import assert from 'node:assert/strict';
import test from 'node:test';

import { mapScheduleItem, shouldIncludeItem, sortScheduleItems } from '../mapper';

import type { ScheduleItem } from '../../types';

test('maps Fitbase transport fields into the public schedule contract', () => {
  const mapped = mapScheduleItem({
    id: 42,
    date: '2026-08-09',
    time_start: '10:00',
    training: { name: 'Пилатес', description: 'Описание', color: '#00d10e' },
    trainers: [{ surname: 'Иванова', name: 'Анна', photo: 'trainer.jpg' }],
    place: { name: 'Зал 1' },
    transfer_event: { date: '2026-08-10', time_start: '11:00' },
  });

  assert.equal(mapped.title, 'Пилатес');
  assert.deepEqual(mapped.trainers, [{ name: 'Иванова Анна', photo: 'trainer.jpg' }]);
  assert.equal(mapped.place, 'Зал 1');
  assert.deepEqual(mapped.transfer, { date: '2026-08-10', timeStart: '11:00', timeEnd: '' });
});

test('drops malformed trainers without failing the whole schedule item', () => {
  const mapped = mapScheduleItem({
    id: 43,
    date: '2026-08-09',
    training: { name: 'Йога' },
    trainers: [null, 42, 'unexpected', {}, { full_name: ' Анна Иванова ', photo: 123 }],
  });

  assert.equal(mapped.title, 'Йога');
  assert.deepEqual(mapped.trainers, [{ name: 'Анна Иванова', photo: '' }]);
});

test('filters non-public entries and sorts the remaining schedule chronologically', () => {
  assert.equal(shouldIncludeItem({ event_type: 'rent' }), false);
  assert.equal(shouldIncludeItem({ is_archive: 1 }), false);
  assert.equal(shouldIncludeItem({ event_type: 'training' }), true);

  const items = [
    { date: '2026-08-10', timeStart: '09:00' },
    { date: '2026-08-09', timeStart: '12:00' },
    { date: '2026-08-09', timeStart: '10:00' },
  ] as ScheduleItem[];

  assert.deepEqual(
    sortScheduleItems(items).map(item => `${item.date} ${item.timeStart}`),
    ['2026-08-09 10:00', '2026-08-09 12:00', '2026-08-10 09:00'],
  );
});
