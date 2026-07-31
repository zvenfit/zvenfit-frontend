(function () {
  const GRID_START_MINUTES = 7 * 60;
  const GRID_END_MINUTES = 22 * 60;
  const GRID_TOTAL_MINUTES = GRID_END_MINUTES - GRID_START_MINUTES;
  const GRID_HOUR_COUNT = GRID_TOTAL_MINUTES / 60;
  const DAY_COLUMN_HEIGHT = 1080;
  const HOUR_HEIGHT = DAY_COLUMN_HEIGHT / GRID_HOUR_COUNT;
  const EVENT_GAP_X = 6;
  const EVENT_INSET_Y = 2;
  const EVENT_GAP_Y = 4;
  const MIN_EVENT_HEIGHT = 26;
  const MIN_EVENT_WIDTH = 120;
  const MIN_DAY_WIDTH = 144;
  const TIME_AXIS_WIDTH = 48;
  const MSK_TIMEZONE = 'Europe/Moscow';

  const WEEKDAY_SHORT = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK_TIMEZONE,
    weekday: 'short',
  });

  const WEEK_RANGE = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK_TIMEZONE,
    day: 'numeric',
    month: 'long',
  });

  const state = {
    weekStart: '',
    items: [],
    dialog: null,
    scrollLockY: 0,
    filters: {
      type: 'all',
      place: 'all',
      club: 'all',
    },
  };

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined && text !== null && text !== '') {
      element.textContent = text;
    }

    return element;
  }

  function getMoscowDateString(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: MSK_TIMEZONE }).format(date);
  }

  function addDays(dateString, days) {
    const [year, month, day] = dateString.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day + days));

    return utcDate.toISOString().slice(0, 10);
  }

  function getMonday(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const weekday = date.getDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;

    return addDays(dateString, offset);
  }

  function getWeekDates(weekStart) {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  function formatWeekRange(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    const fromLabel = WEEK_RANGE.format(new Date(`${weekStart}T12:00:00`));
    const toLabel = WEEK_RANGE.format(new Date(`${weekEnd}T12:00:00`));

    return `${fromLabel} — ${toLabel}`;
  }

  function formatDayHead(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const weekday = WEEKDAY_SHORT.format(date).replace('.', '');
    const day = date.getDate();

    return `${weekday} ${day}`;
  }

  function parseTimeToMinutes(timeString) {
    if (!timeString) {
      return GRID_START_MINUTES;
    }

    const [hours, minutes] = timeString.split(':');

    return Number(hours) * 60 + Number(minutes);
  }

  function formatTimeLabel(timeString) {
    if (!timeString) {
      return '';
    }

    const [hours, minutes] = timeString.split(':');

    return `${hours}:${minutes}`;
  }

  function getScheduleApiBase() {
    const configured = (window.ZVENFIT_SCHEDULE_API || '').trim();
    if (configured && configured !== '__SCHEDULE_API_URL__') {
      return configured;
    }

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return 'http://localhost:3000/schedule';
    }

    return '';
  }

  function getApiUrl(from, to) {
    const base = getScheduleApiBase();
    if (!base) {
      return '';
    }

    const url = base.startsWith('http')
      ? new URL(base)
      : new URL(base, window.location.origin);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);

    return url.toString();
  }

  function groupItemsByDate(items) {
    const groups = new Map();

    for (const item of items) {
      if (!groups.has(item.date)) {
        groups.set(item.date, []);
      }

      groups.get(item.date).push(item);
    }

    for (const dayItems of groups.values()) {
      dayItems.sort((left, right) => left.timeStart.localeCompare(right.timeStart));
    }

    return groups;
  }

  function getEventTimeRange(item) {
    const startMinutes = Math.max(parseTimeToMinutes(item.timeStart), GRID_START_MINUTES);
    const endMinutes = Math.min(
      parseTimeToMinutes(item.timeEnd) || startMinutes + (item.duration || 60),
      GRID_END_MINUTES,
    );

    return {
      start: startMinutes,
      end: Math.max(endMinutes, startMinutes + 1),
    };
  }

  function eventsOverlap(leftItem, rightItem) {
    const leftRange = getEventTimeRange(leftItem);
    const rightRange = getEventTimeRange(rightItem);

    return leftRange.start < rightRange.end && rightRange.start < leftRange.end;
  }

  function layoutCluster(cluster) {
    const sorted = [...cluster].sort((left, right) => {
      const leftRange = getEventTimeRange(left);
      const rightRange = getEventTimeRange(right);

      if (leftRange.start !== rightRange.start) {
        return leftRange.start - rightRange.start;
      }

      return rightRange.end - leftRange.end - (rightRange.start - leftRange.start);
    });

    const columnEnds = [];
    const layout = new Map();

    for (const item of sorted) {
      const range = getEventTimeRange(item);
      let columnIndex = columnEnds.findIndex(columnEnd => columnEnd <= range.start);

      if (columnIndex === -1) {
        columnIndex = columnEnds.length;
        columnEnds.push(range.end);
      } else {
        columnEnds[columnIndex] = range.end;
      }

      layout.set(item.id, { columnIndex, columnCount: 0 });
    }

    const columnCount = Math.max(columnEnds.length, 1);
    for (const data of layout.values()) {
      data.columnCount = columnCount;
    }

    return layout;
  }

  function assignEventColumns(dayItems) {
    if (!dayItems.length) {
      return new Map();
    }

    let clusters = [];

    for (const item of dayItems) {
      const overlapIndexes = [];

      for (let index = 0; index < clusters.length; index += 1) {
        if (clusters[index].some(other => eventsOverlap(other, item))) {
          overlapIndexes.push(index);
        }
      }

      if (overlapIndexes.length === 0) {
        clusters.push([item]);
        continue;
      }

      const merged = [item];
      for (let index = overlapIndexes.length - 1; index >= 0; index -= 1) {
        merged.push(...clusters[overlapIndexes[index]]);
        clusters.splice(overlapIndexes[index], 1);
      }

      clusters.push(merged);
    }

    const layout = new Map();

    for (const cluster of clusters) {
      for (const [itemId, data] of layoutCluster(cluster)) {
        layout.set(itemId, data);
      }
    }

    return layout;
  }

  function getMaxOverlapColumns(layoutMap) {
    let maxColumns = 1;

    for (const data of layoutMap.values()) {
      maxColumns = Math.max(maxColumns, data.columnCount);
    }

    return maxColumns;
  }

  function getDayColumnWidth(layoutMap) {
    const maxColumns = getMaxOverlapColumns(layoutMap);

    if (maxColumns <= 1) {
      return MIN_DAY_WIDTH;
    }

    return maxColumns * MIN_EVENT_WIDTH + (maxColumns + 1) * EVENT_GAP_X;
  }

  function buildGridColumnsTemplate(dayWidths) {
    return `${TIME_AXIS_WIDTH}px ${dayWidths.map(width => `${width}px`).join(' ')}`;
  }

  function getEventPosition(item) {
    const range = getEventTimeRange(item);
    const durationMinutes = range.end - range.start;
    const top = ((range.start - GRID_START_MINUTES) / GRID_TOTAL_MINUTES) * DAY_COLUMN_HEIGHT;
    const height = (durationMinutes / 60) * HOUR_HEIGHT;

    return {
      top: top + EVENT_INSET_Y,
      height: Math.max(height - EVENT_INSET_Y - EVENT_GAP_Y, MIN_EVENT_HEIGHT),
    };
  }

  function applyEventLayout(event, layout, dayColumnWidth) {
    if (!layout || layout.columnCount <= 1) {
      event.style.left = `${EVENT_GAP_X}px`;
      event.style.width = `${dayColumnWidth - EVENT_GAP_X * 2}px`;

      return;
    }

    const slotWidth = dayColumnWidth / layout.columnCount;
    event.style.left = `${layout.columnIndex * slotWidth + EVENT_GAP_X}px`;
    event.style.width = `${slotWidth - EVENT_GAP_X * 2}px`;
  }

  function getEventCardWidth(layout, dayColumnWidth) {
    if (!layout || layout.columnCount <= 1) {
      return dayColumnWidth - EVENT_GAP_X * 2;
    }

    const slotWidth = dayColumnWidth / layout.columnCount;

    return slotWidth - EVENT_GAP_X * 2;
  }

  function formatEventTimeLabel(item) {
    return [formatTimeLabel(item.timeStart), formatTimeLabel(item.timeEnd)].filter(Boolean).join('–');
  }

  function getEventLineBudget(height) {
    if (height < 32) {
      return 1;
    }

    if (height < 46) {
      return 2;
    }

    if (height < 62) {
      return 3;
    }

    return 4;
  }

  function renderEvent(item, layout, dayColumnWidth) {
    const position = getEventPosition(item);
    const width = getEventCardWidth(layout, dayColumnWidth);
    const lineBudget = getEventLineBudget(position.height);
    const classNames = ['schedule-event'];

    if (width < 110) {
      classNames.push('schedule-event--narrow');
    }

    if (lineBudget <= 1) {
      classNames.push('schedule-event--lines-1');
    } else if (lineBudget === 2) {
      classNames.push('schedule-event--lines-2');
    } else {
      classNames.push('schedule-event--lines-3');
    }

    if (item.cancelled) {
      classNames.push('schedule-event--cancelled');
    }

    const event = createElement('article', classNames.join(' '));
    const background = item.color || '#00d10e';
    const timeLabel = formatEventTimeLabel(item);

    event.style.top = `${position.top}px`;
    event.style.height = `${position.height}px`;
    event.style.zIndex = String(getEventTimeRange(item).start);
    event.style.setProperty('--schedule-event-bg', background);
    event.style.setProperty('--schedule-event-text', getReadableTextColor(background));
    applyEventLayout(event, layout, dayColumnWidth);
    bindEventCardInteractions(event, item);

    event.appendChild(createElement('p', 'schedule-event__time', timeLabel));
    event.appendChild(createElement('p', 'schedule-event__title', item.title));

    if (lineBudget >= 3) {
      const subtitle = buildTrainerLine(item) || item.place || '';
      if (subtitle) {
        event.appendChild(createElement('p', 'schedule-event__meta', subtitle));
      }
    }

    return event;
  }

  function markOverflowingEvents(container) {
    requestAnimationFrame(() => {
      container.querySelectorAll('.schedule-event').forEach(eventNode => {
        if (eventNode.scrollHeight > eventNode.clientHeight + 1) {
          eventNode.classList.add('schedule-event--clipped');
        }
      });
    });
  }

  function formatEventDateLabel(dateString) {
    const date = new Date(`${dateString}T12:00:00`);

    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: MSK_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
  }

  function lockPageScroll() {
    state.scrollLockY = window.scrollY;
    document.documentElement.classList.add('schedule-dialog-open');
    document.body.style.top = `-${state.scrollLockY}px`;
  }

  function unlockPageScroll() {
    document.documentElement.classList.remove('schedule-dialog-open');
    document.body.style.top = '';
    window.scrollTo(0, state.scrollLockY);
  }

  function decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;

    return textarea.value;
  }

  function sanitizeScheduleHtml(html) {
    if (!html) {
      return '';
    }

    const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'A']);
    const template = document.createElement('template');
    template.innerHTML = decodeHtmlEntities(html);

    function cleanNode(node) {
      const children = [...node.childNodes];

      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) {
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE || !allowedTags.has(child.tagName)) {
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }

          child.remove();
          continue;
        }

        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';

          if (!/^https?:\/\//i.test(href)) {
            child.removeAttribute('href');
          } else {
            child.setAttribute('rel', 'noopener noreferrer');
            child.setAttribute('target', '_blank');
          }
        }

        for (const attribute of [...child.attributes]) {
          if (child.tagName === 'A' && ['href', 'rel', 'target'].includes(attribute.name)) {
            continue;
          }

          child.removeAttribute(attribute.name);
        }

        cleanNode(child);
      }
    }

    cleanNode(template.content);

    return template.innerHTML.trim();
  }

  function formatEventTypeLabel(type) {
    if (type === 'group') {
      return 'Групповое';
    }

    if (type === 'personal') {
      return 'Персональное';
    }

    return '';
  }

  function setDialogRow(dialog, field, label, value) {
    const row = dialog.querySelector(`[data-field="${field}"]`);
    if (!row) {
      return;
    }

    if (!value) {
      row.hidden = true;

      return;
    }

    row.hidden = false;
    row.querySelector('.schedule-dialog__label').textContent = label;
    row.querySelector('.schedule-dialog__value').textContent = value;
  }

  function ensureEventDialog() {
    if (state.dialog) {
      return state.dialog;
    }

    const dialog = createElement('dialog', 'schedule-dialog');
    dialog.setAttribute('aria-labelledby', 'schedule-dialog-title');

    const panel = createElement('div', 'schedule-dialog__panel');

    const closeButton = createElement('button', 'schedule-dialog__close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', () => dialog.close());

    const header = createElement('header', 'schedule-dialog__header');
    const chip = createElement('div', 'schedule-dialog__chip');
    const heading = createElement('div', 'schedule-dialog__heading');
    const title = createElement('h2', 'schedule-dialog__title');
    title.id = 'schedule-dialog-title';
    const schedule = createElement('p', 'schedule-dialog__schedule');
    heading.appendChild(title);
    heading.appendChild(schedule);
    header.appendChild(chip);
    header.appendChild(heading);

    const body = createElement('div', 'schedule-dialog__body');
    const details = createElement('div', 'schedule-dialog__details');

    for (const [field, label] of [
      ['trainer', 'тренер'],
      ['place', 'зал'],
      ['type', 'тип'],
    ]) {
      const row = createElement('div', 'schedule-dialog__row');
      row.dataset.field = field;
      row.appendChild(createElement('p', 'schedule-dialog__label slash-prefix', label));
      row.appendChild(createElement('p', 'schedule-dialog__value'));
      details.appendChild(row);
    }

    const description = createElement('div', 'schedule-dialog__description');
    const badges = createElement('div', 'schedule-dialog__badges');

    body.appendChild(details);
    body.appendChild(description);
    body.appendChild(badges);

    panel.appendChild(closeButton);
    panel.appendChild(header);
    panel.appendChild(body);
    dialog.appendChild(panel);

    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener('close', () => {
      unlockPageScroll();
    });

    document.body.appendChild(dialog);
    state.dialog = dialog;

    return dialog;
  }

  function closeEventDialog() {
    if (state.dialog?.open) {
      state.dialog.close();
    }
  }

  function createDialogBadge(text, modifierClass) {
    const badge = createElement('span', modifierClass ? `schedule-dialog__status ${modifierClass}` : 'schedule-dialog__status', text);

    return badge;
  }

  function renderDialogBadges(dialog, item) {
    const badgesNode = dialog.querySelector('.schedule-dialog__badges');
    clearNode(badgesNode);

    if (item.cancelled) {
      badgesNode.appendChild(createDialogBadge('Отменено', 'schedule-dialog__status--cancelled'));
    } else if (item.transfer) {
      badgesNode.appendChild(createDialogBadge('Перенесено', 'schedule-dialog__status--transfer'));
    }

    if (item.ageType === 'kids') {
      badgesNode.appendChild(createDialogBadge('Дети', 'schedule-dialog__status--kids'));
    }

    badgesNode.hidden = badgesNode.childElementCount === 0;
  }

  function openEventDialog(item) {
    const dialog = ensureEventDialog();
    const background = item.color || '#00d10e';
    const timeLabel = formatEventTimeLabel(item);
    const dateLabel = formatEventDateLabel(item.date);

    dialog.querySelector('.schedule-dialog__chip').style.background = background;
    dialog.querySelector('.schedule-dialog__title').textContent = item.title;
    dialog.querySelector('.schedule-dialog__schedule').textContent = `${dateLabel} · ${timeLabel}`;

    setDialogRow(dialog, 'trainer', 'тренер', buildTrainerLine(item));
    setDialogRow(dialog, 'place', 'зал', item.place || '');
    setDialogRow(dialog, 'type', 'тип', formatEventTypeLabel(item.type));

    const descriptionNode = dialog.querySelector('.schedule-dialog__description');
    const safeDescription = sanitizeScheduleHtml(item.description);

    if (safeDescription) {
      descriptionNode.innerHTML = safeDescription;
      descriptionNode.hidden = false;
    } else {
      descriptionNode.innerHTML = '';
      descriptionNode.hidden = true;
    }

    renderDialogBadges(dialog, item);

    dialog.showModal();
    lockPageScroll();
  }

  function bindEventCardInteractions(event, item) {
    event.setAttribute('role', 'button');
    event.setAttribute('tabindex', '0');
    event.setAttribute('aria-haspopup', 'dialog');
    event.setAttribute(
      'aria-label',
      [item.title, formatEventTimeLabel(item), buildMetaLine(item)].filter(Boolean).join(', '),
    );

    event.addEventListener('click', () => openEventDialog(item));
    event.addEventListener('keydown', keyEvent => {
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        keyEvent.preventDefault();
        openEventDialog(item);
      }
    });
  }

  function getReadableTextColor(backgroundColor) {
    if (!backgroundColor || !backgroundColor.startsWith('#') || backgroundColor.length < 7) {
      return '#ffffff';
    }

    const red = parseInt(backgroundColor.slice(1, 3), 16);
    const green = parseInt(backgroundColor.slice(3, 5), 16);
    const blue = parseInt(backgroundColor.slice(5, 7), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

    return luminance > 0.62 ? '#111111' : '#ffffff';
  }

  function buildTrainerLine(item) {
    if (!item.trainers?.length) {
      return '';
    }

    return item.trainers.map(trainer => trainer.name).filter(Boolean).join(', ');
  }

  function buildMetaLine(item) {
    return [buildTrainerLine(item), item.place, item.club].filter(Boolean).join(' · ');
  }

  function renderTimeAxis() {
    const axis = createElement('div', 'schedule-grid__times');
    axis.style.height = `${DAY_COLUMN_HEIGHT}px`;
    const startHour = GRID_START_MINUTES / 60;
    const endHour = GRID_END_MINUTES / 60;

    for (let hour = startHour; hour <= endHour; hour += 1) {
      const label = createElement('div', 'schedule-grid__time', `${String(hour).padStart(2, '0')}:00`);
      const top = ((hour * 60 - GRID_START_MINUTES) / GRID_TOTAL_MINUTES) * DAY_COLUMN_HEIGHT;
      label.style.top = `${top}px`;

      if (hour === startHour) {
        label.classList.add('schedule-grid__time--start');
      } else if (hour === endHour) {
        label.classList.add('schedule-grid__time--end');
      }

      axis.appendChild(label);
    }

    return axis;
  }

  function bindStickyTimeColumnScroll(inner) {
    inner.addEventListener(
      'scroll',
      () => {
        inner.dataset.scrolled = inner.scrollLeft > 0 ? 'true' : 'false';
      },
      { passive: true },
    );
  }

  function renderWeekGrid(items) {
    const weekDates = getWeekDates(state.weekStart);
    const grouped = groupItemsByDate(items);
    const today = getMoscowDateString();
    const dayLayouts = weekDates.map(date => assignEventColumns(grouped.get(date) || []));
    const dayWidths = dayLayouts.map(layoutMap => getDayColumnWidth(layoutMap));
    const gridColumns = buildGridColumnsTemplate(dayWidths);
    const dayColumns = dayWidths.map(width => `${width}px`).join(' ');

    const grid = createElement('div', 'schedule-grid');
    const inner = createElement('div', 'schedule-grid__inner');
    inner.style.setProperty('--schedule-hour-height', `${HOUR_HEIGHT}px`);
    inner.style.setProperty('--schedule-day-height', `${DAY_COLUMN_HEIGHT}px`);

    const head = createElement('div', 'schedule-grid__head');
    head.style.gridTemplateColumns = gridColumns;
    head.appendChild(createElement('div', 'schedule-grid__corner', ''));

    for (const date of weekDates) {
      const dayHead = createElement(
        'div',
        date === today ? 'schedule-grid__day-head schedule-grid__day-head--today' : 'schedule-grid__day-head',
        formatDayHead(date),
      );
      dayHead.dataset.date = date;
      head.appendChild(dayHead);
    }

    inner.appendChild(head);

    const body = createElement('div', 'schedule-grid__body');
    body.style.gridTemplateColumns = gridColumns;
    body.appendChild(renderTimeAxis());

    const days = createElement('div', 'schedule-grid__days');
    days.style.gridTemplateColumns = dayColumns;

    for (let index = 0; index < weekDates.length; index += 1) {
      const date = weekDates[index];
      const column = createElement(
        'div',
        date === today ? 'schedule-grid__day schedule-grid__day--today' : 'schedule-grid__day',
      );
      column.style.height = `${DAY_COLUMN_HEIGHT}px`;
      column.dataset.date = date;

      const dayItems = grouped.get(date) || [];
      const layoutMap = dayLayouts[index];
      const dayColumnWidth = dayWidths[index];

      for (const item of dayItems) {
        column.appendChild(renderEvent(item, layoutMap.get(item.id), dayColumnWidth));
      }

      days.appendChild(column);
    }

    body.appendChild(days);
    inner.appendChild(body);
    grid.appendChild(inner);
    bindStickyTimeColumnScroll(inner);

    return grid;
  }

  const SKELETON_DAY_BLOCKS = [
    [{ top: 8, height: 11 }, { top: 24, height: 15 }, { top: 42, height: 9 }, { top: 58, height: 13 }],
    [{ top: 10, height: 12 }, { top: 28, height: 10 }, { top: 44, height: 16 }, { top: 66, height: 8 }],
    [{ top: 6, height: 14 }, { top: 26, height: 11 }, { top: 41, height: 12 }],
    [{ top: 12, height: 10 }, { top: 30, height: 14 }, { top: 50, height: 9 }, { top: 64, height: 11 }],
    [{ top: 9, height: 13 }, { top: 32, height: 10 }, { top: 48, height: 12 }],
    [{ top: 14, height: 9 }, { top: 28, height: 12 }, { top: 46, height: 10 }],
    [{ top: 7, height: 10 }, { top: 22, height: 13 }, { top: 40, height: 8 }],
  ];

  function renderSkeletonGrid() {
    const weekDates = getWeekDates(state.weekStart);
    const today = getMoscowDateString();
    const dayWidth = MIN_DAY_WIDTH;
    const gridColumns = buildGridColumnsTemplate(Array(7).fill(dayWidth));
    const dayColumns = Array(7).fill(`${dayWidth}px`).join(' ');

    const grid = createElement('div', 'schedule-grid schedule-grid--skeleton');
    const inner = createElement('div', 'schedule-grid__inner');
    inner.style.setProperty('--schedule-hour-height', `${HOUR_HEIGHT}px`);
    inner.style.setProperty('--schedule-day-height', `${DAY_COLUMN_HEIGHT}px`);

    const head = createElement('div', 'schedule-grid__head');
    head.style.gridTemplateColumns = gridColumns;
    head.appendChild(createElement('div', 'schedule-grid__corner', ''));

    for (const date of weekDates) {
      const dayHead = createElement(
        'div',
        date === today
          ? 'schedule-grid__day-head schedule-grid__day-head--today schedule-skeleton__day-head'
          : 'schedule-grid__day-head schedule-skeleton__day-head',
      );
      dayHead.appendChild(createElement('span', 'schedule-skeleton__bar schedule-skeleton__bar--day'));
      head.appendChild(dayHead);
    }

    inner.appendChild(head);

    const body = createElement('div', 'schedule-grid__body');
    body.style.gridTemplateColumns = gridColumns;
    body.appendChild(renderTimeAxis());

    const days = createElement('div', 'schedule-grid__days');
    days.style.gridTemplateColumns = dayColumns;

    for (let index = 0; index < weekDates.length; index += 1) {
      const column = createElement('div', 'schedule-grid__day schedule-skeleton__day');
      column.style.height = `${DAY_COLUMN_HEIGHT}px`;

      for (const block of SKELETON_DAY_BLOCKS[index]) {
        const skeletonEvent = createElement('div', 'schedule-skeleton__event');
        skeletonEvent.style.top = `${(block.top / 100) * DAY_COLUMN_HEIGHT}px`;
        skeletonEvent.style.height = `${(block.height / 100) * DAY_COLUMN_HEIGHT}px`;
        column.appendChild(skeletonEvent);
      }

      days.appendChild(column);
    }

    body.appendChild(days);
    inner.appendChild(body);
    grid.appendChild(inner);
    bindStickyTimeColumnScroll(inner);

    return grid;
  }

  function renderToolbarSkeleton() {
    const toolbar = createElement('div', 'schedule-week__toolbar schedule-week__toolbar--skeleton');

    const prevButton = createElement('button', 'schedule-week__nav schedule-week__nav--disabled', '←');
    prevButton.type = 'button';
    prevButton.disabled = true;
    prevButton.setAttribute('aria-hidden', 'true');

    const nextButton = createElement('button', 'schedule-week__nav schedule-week__nav--disabled', '→');
    nextButton.type = 'button';
    nextButton.disabled = true;
    nextButton.setAttribute('aria-hidden', 'true');

    const label = createElement('p', 'schedule-week__label');
    label.appendChild(createElement('span', 'schedule-skeleton__bar schedule-skeleton__bar--range'));

    toolbar.appendChild(prevButton);
    toolbar.appendChild(label);
    toolbar.appendChild(nextButton);

    return toolbar;
  }

  function hasActiveFilters() {
    return state.filters.type !== 'all' || state.filters.place !== 'all' || state.filters.club !== 'all';
  }

  function resetFilters() {
    state.filters.type = 'all';
    state.filters.place = 'all';
    state.filters.club = 'all';
    render();
  }

  function getFilterOptions(items) {
    const places = new Set();
    const clubs = new Set();

    for (const item of items) {
      if (item.place) {
        places.add(item.place);
      }

      if (item.club) {
        clubs.add(item.club);
      }
    }

    return {
      places: [...places].sort((left, right) => left.localeCompare(right, 'ru')),
      clubs: [...clubs].sort((left, right) => left.localeCompare(right, 'ru')),
    };
  }

  function normalizeFilters(options) {
    if (state.filters.place !== 'all' && !options.places.includes(state.filters.place)) {
      state.filters.place = 'all';
    }

    if (state.filters.club !== 'all' && !options.clubs.includes(state.filters.club)) {
      state.filters.club = 'all';
    }
  }

  function applyFilters(items) {
    return items.filter(item => {
      if (state.filters.type !== 'all' && item.type !== state.filters.type) {
        return false;
      }

      if (state.filters.place !== 'all' && item.place !== state.filters.place) {
        return false;
      }

      if (state.filters.club !== 'all' && item.club !== state.filters.club) {
        return false;
      }

      return true;
    });
  }

  function setFilter(key, value) {
    state.filters[key] = value;
    render();
  }

  function renderFilterPills(key, label, choices) {
    const field = createElement('div', 'schedule-filters__field');
    field.appendChild(createElement('span', 'schedule-filters__label', label));

    const pills = createElement('div', 'schedule-filters__pills');
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', label);

    for (const choice of choices) {
      const isActive = state.filters[key] === choice.value;
      const button = createElement(
        'button',
        isActive ? 'schedule-filter schedule-filter--active' : 'schedule-filter',
        choice.label,
      );
      button.type = 'button';
      button.dataset.filter = key;
      button.dataset.value = choice.value;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.addEventListener('click', () => {
        if (state.filters[key] !== choice.value) {
          setFilter(key, choice.value);
        }
      });
      pills.appendChild(button);
    }

    field.appendChild(pills);

    return field;
  }

  function renderFilterSelect(key, labelText, values, allLabel) {
    const field = createElement('div', 'schedule-filters__field');
    const fieldId = `schedule-filter-${key}`;
    const labelNode = createElement('label', 'schedule-filters__label', labelText);
    labelNode.htmlFor = fieldId;
    field.appendChild(labelNode);

    const select = createElement('select', 'schedule-filters__select');
    select.id = fieldId;
    select.dataset.filter = key;

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = allLabel;
    select.appendChild(allOption);

    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (state.filters[key] === value) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    if (state.filters[key] === 'all') {
      select.value = 'all';
    }

    select.addEventListener('change', () => {
      setFilter(key, select.value);
    });

    field.appendChild(select);

    return field;
  }

  function renderFilters() {
    const options = getFilterOptions(state.items);
    normalizeFilters(options);

    const bar = createElement('div', 'schedule-filters');
    bar.appendChild(
      renderFilterPills('type', 'Тип', [
        { value: 'all', label: 'Все' },
        { value: 'group', label: 'Групповые' },
        { value: 'personal', label: 'Персональные' },
      ]),
    );

    if (options.clubs.length > 1) {
      bar.appendChild(renderFilterSelect('club', 'Клуб', options.clubs, 'Все клубы'));
    }

    if (options.places.length > 1) {
      bar.appendChild(renderFilterSelect('place', 'Зал', options.places, 'Все залы'));
    }

    if (hasActiveFilters()) {
      const resetButton = createElement('button', 'schedule-filters__reset', 'Сбросить');
      resetButton.type = 'button';
      resetButton.addEventListener('click', resetFilters);
      bar.appendChild(resetButton);
    }

    return bar;
  }

  function renderFiltersSkeleton() {
    const bar = createElement('div', 'schedule-filters schedule-filters--skeleton');
    bar.setAttribute('aria-hidden', 'true');
    bar.appendChild(createElement('span', 'schedule-skeleton__bar schedule-filters__bar--filter'));
    bar.appendChild(createElement('span', 'schedule-skeleton__bar schedule-filters__bar--filter'));

    return bar;
  }

  function renderToolbar() {
    const toolbar = createElement('div', 'schedule-week__toolbar');

    const prevButton = createElement('button', 'schedule-week__nav', '←');
    prevButton.type = 'button';
    prevButton.setAttribute('aria-label', 'Предыдущая неделя');
    prevButton.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, -7);
      render();
    });

    const nextButton = createElement('button', 'schedule-week__nav', '→');
    nextButton.type = 'button';
    nextButton.setAttribute('aria-label', 'Следующая неделя');
    nextButton.addEventListener('click', () => {
      state.weekStart = addDays(state.weekStart, 7);
      render();
    });

    const label = createElement('p', 'schedule-week__label', formatWeekRange(state.weekStart));

    toolbar.appendChild(prevButton);
    toolbar.appendChild(label);
    toolbar.appendChild(nextButton);

    return toolbar;
  }

  function renderEmptyWeek(filtered) {
    const empty = createElement('div', 'schedule-state schedule-state--empty');

    if (filtered) {
      empty.appendChild(createElement('p', 'schedule-state__title', 'Ничего не найдено'));
      empty.appendChild(
        createElement('p', 'schedule-state__text', 'Измените фильтры или выберите другую неделю.'),
      );

      const resetButton = createElement('button', 'schedule-state__reset', 'Сбросить фильтры');
      resetButton.type = 'button';
      resetButton.addEventListener('click', resetFilters);
      empty.appendChild(resetButton);

      return empty;
    }

    empty.appendChild(createElement('p', 'schedule-state__title', 'На этой неделе занятий нет'));
    empty.appendChild(
      createElement(
        'p',
        'schedule-state__text',
        'Попробуйте другую неделю или уточните расписание у администратора.',
      ),
    );

    return empty;
  }

  function renderLoading() {
    const shell = createElement('div', 'schedule-week schedule-week--skeleton');
    shell.setAttribute('aria-busy', 'true');
    shell.setAttribute('aria-live', 'polite');
    shell.appendChild(renderToolbarSkeleton());
    shell.appendChild(renderFiltersSkeleton());
    shell.appendChild(renderSkeletonGrid());

    return shell;
  }

  function renderError(reason) {
    const error = createElement('div', 'schedule-state schedule-state--error');
    error.setAttribute('role', 'alert');
    error.appendChild(createElement('p', 'schedule-state__title', 'Не удалось загрузить расписание'));

    const details = {
      missing_api: 'Не настроен адрес API расписания. Пересоберите сайт с SCHEDULE_API_URL или запустите npm run dev:watch.',
      network: 'Не удалось связаться с API. Локально нужны npm run dev:watch (mock-server на :3000).',
      http: 'API вернул ошибку. Проверьте FITBASE_API_TOKEN и логи fitbase-schedule.',
      invalid_response: 'API вернул некорректный ответ.',
    };

    error.appendChild(
      createElement(
        'p',
        'schedule-state__text',
        details[reason] || 'Попробуйте обновить страницу или свяжитесь с клубом:',
      ),
    );

    const contacts = createElement('p', 'schedule-state__contacts');
    const phonePrimary = document.createElement('a');
    phonePrimary.href = 'tel:+79253082323';
    phonePrimary.textContent = '+7 (925) 308-23-23';
    contacts.appendChild(phonePrimary);
    contacts.appendChild(document.createTextNode(' · '));
    const phoneSecondary = document.createElement('a');
    phoneSecondary.href = 'tel:+79688440088';
    phoneSecondary.textContent = '+7 (968) 844-00-88';
    contacts.appendChild(phoneSecondary);
    error.appendChild(contacts);

    return error;
  }

  function renderWeekView(root) {
    closeEventDialog();

    const weekEnd = addDays(state.weekStart, 6);
    const options = getFilterOptions(state.items);
    normalizeFilters(options);
    const filteredItems = applyFilters(state.items);
    const weekItems = filteredItems.filter(item => item.date >= state.weekStart && item.date <= weekEnd);
    const hasUnfilteredWeekItems = state.items.some(
      item => item.date >= state.weekStart && item.date <= weekEnd,
    );

    const shell = createElement('div', 'schedule-week');
    shell.appendChild(renderToolbar());

    if (state.items.length > 0) {
      shell.appendChild(renderFilters());
    }

    if (weekItems.length === 0) {
      shell.appendChild(renderEmptyWeek(hasActiveFilters() && hasUnfilteredWeekItems));
    } else {
      shell.appendChild(renderWeekGrid(weekItems));
      markOverflowingEvents(shell);
    }

    clearNode(root);
    root.appendChild(shell);
  }

  function render() {
    const root = document.querySelector('[data-schedule-root]');
    if (!root) {
      return;
    }

    renderWeekView(root);
  }

  async function loadSchedule(root) {
    state.weekStart = getMonday(getMoscowDateString());

    const fetchFrom = state.weekStart;
    const fetchTo = addDays(state.weekStart, 13);
    const apiUrl = getApiUrl(fetchFrom, fetchTo);

    clearNode(root);
    root.appendChild(renderLoading());

    if (!apiUrl) {
      clearNode(root);
      root.appendChild(renderError('missing_api'));

      return;
    }

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error('schedule: API HTTP', response.status, apiUrl);
        clearNode(root);
        root.appendChild(renderError('http'));

        return;
      }

      const data = await response.json();
      if (!data.ok || !Array.isArray(data.items)) {
        console.error('schedule: invalid API payload', data);
        clearNode(root);
        root.appendChild(renderError('invalid_response'));

        return;
      }

      state.items = data.items;
      renderWeekView(root);
    } catch (loadError) {
      console.error('schedule: fetch failed', loadError);
      clearNode(root);
      root.appendChild(renderError('network'));
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const root = document.querySelector('[data-schedule-root]');
    if (!root) {
      return;
    }

    loadSchedule(root);
  });
})();
