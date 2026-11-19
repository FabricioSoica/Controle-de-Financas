const test = require('node:test');
const assert = require('node:assert/strict');
const { getCompetenceMonth, toCompetenceKey, shiftCompetence } = require('../utils/competence');

test('dates from the start day on belong to their own month', () => {
  assert.equal(getCompetenceMonth('2026-11-15', 15), '11/2026');
  assert.equal(getCompetenceMonth('2026-11-30', 15), '11/2026');
});

test('dates before the start day belong to the previous month', () => {
  assert.equal(getCompetenceMonth('2026-11-14', 15), '10/2026');
  assert.equal(getCompetenceMonth('2026-12-03', 15), '11/2026');
});

test('january before the start day goes back to december of the previous year', () => {
  assert.equal(getCompetenceMonth('2027-01-10', 15), '12/2026');
});

test('start day 1 makes the competence equal to the calendar month', () => {
  assert.equal(getCompetenceMonth('2026-11-01', 1), '11/2026');
});

test('competence keys sort chronologically across years', () => {
  assert.ok(toCompetenceKey('12/2026') < toCompetenceKey('01/2027'));
});

test('shiftCompetence moves across year boundaries in both directions', () => {
  assert.equal(shiftCompetence('11/2026', 2), '01/2027');
  assert.equal(shiftCompetence('03/2027', -14), '01/2026');
});
