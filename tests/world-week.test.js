import test from 'node:test';
import assert from 'node:assert/strict';
import { getISOWeekDetails, getCurrentWorldWeek, getPreviousWorldWeek, getWeekRangeFromWeekStr } from '../core/world-week.js';

test('World Week - ISO-8601 calculation produces strict Monday-to-Sunday ranges', () => {
  const w32 = getISOWeekDetails('2026-08-05T12:00:00Z');
  assert.equal(w32.weekStr, '2026-W32');
  assert.equal(w32.mondayStr, '2026-08-03');
  assert.equal(w32.sundayStr, '2026-08-09');
  assert.equal(w32.dateRange, '2026-08-03 ~ 2026-08-09');
});

test('World Week - boundary test for Monday (start) and Sunday (end)', () => {
  const monday = getISOWeekDetails('2026-08-10T00:00:00Z');
  const sunday = getISOWeekDetails('2026-08-16T23:59:59Z');
  
  assert.equal(monday.weekStr, '2026-W33');
  assert.equal(monday.mondayStr, '2026-08-10');
  assert.equal(monday.sundayStr, '2026-08-16');
  
  assert.equal(sunday.weekStr, '2026-W33');
  assert.equal(sunday.mondayStr, '2026-08-10');
  assert.equal(sunday.sundayStr, '2026-08-16');
});

test('World Week - getCurrentWorldWeek & getPreviousWorldWeek alignment', () => {
  const fixedNow = new Date('2026-08-15T18:00:00Z');
  const current = getCurrentWorldWeek(fixedNow);
  const previous = getPreviousWorldWeek(fixedNow);

  assert.equal(current.weekStr, '2026-W33');
  assert.equal(current.dateRange, '2026-08-10 ~ 2026-08-16');

  assert.equal(previous.weekStr, '2026-W32');
  assert.equal(previous.dateRange, '2026-08-03 ~ 2026-08-09');
});

test('World Week - getWeekRangeFromWeekStr parses ISO string back to exact dates', () => {
  const parsed = getWeekRangeFromWeekStr('2026-W32');
  assert.equal(parsed.weekStr, '2026-W32');
  assert.equal(parsed.mondayStr, '2026-08-03');
  assert.equal(parsed.sundayStr, '2026-08-09');
  assert.equal(parsed.dateRange, '2026-08-03 ~ 2026-08-09');
});
