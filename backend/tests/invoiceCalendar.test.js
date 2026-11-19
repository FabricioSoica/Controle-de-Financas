const test = require('node:test');
const assert = require('node:assert/strict');
const InvoiceCalendar = require('../services/InvoiceCalendar');

const calendar = new InvoiceCalendar(15);
const at = (isoDate) => new Date(`${isoDate}T12:00:00Z`);

test('competence invoice is due on the first due day after the competence ends', () => {
  assert.equal(calendar.getCompetenceDueDate('11/2026', 15), '2026-12-15');
  assert.equal(calendar.getCompetenceDueDate('11/2026', 10), '2027-01-10');
});

test('due day is clamped to the last day of short months', () => {
  assert.equal(calendar.getCompetenceDueDate('01/2027', 31), '2027-02-28');
});

test('purchase before the closing day is paid in the current invoice', () => {
  assert.deepEqual(calendar.getPurchaseDueDate(at('2026-11-13'), 14, 15), { dueDate: '2026-11-15', daysToPay: 2 });
});

test('purchase on the closing day goes to the next invoice', () => {
  assert.deepEqual(calendar.getPurchaseDueDate(at('2026-11-14'), 14, 15), { dueDate: '2026-12-15', daysToPay: 31 });
});

test('purchase dates handle the turn of the year', () => {
  assert.deepEqual(calendar.getPurchaseDueDate(at('2026-12-31'), 30, 8), { dueDate: '2027-02-08', daysToPay: 39 });
});
