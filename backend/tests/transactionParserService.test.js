const test = require('node:test');
const assert = require('node:assert/strict');
const TransactionParserService = require('../services/TransactionParserService');

const context = {
  cardNames: ['NuBank', 'Santander', 'Mercado Pago'],
  categories: ['Alimentação', 'Compras', 'Transporte'],
  startDay: 15,
  today: '2026-11-19'
};

const raw = (overrides) => ({
  description: 'Sorveteria', amount: 30, type: 'card', cardName: 'nubank', installments: 1,
  category: 'alimentacao', date: '2026-11-19', notes: '', ...overrides
});

test('matches card and category to the registered ones ignoring case and accents', () => {
  const result = TransactionParserService.normalize(raw(), context);
  assert.equal(result.cardName, 'NuBank');
  assert.equal(result.category, 'Alimentação');
  assert.equal(result.notes, '');
});

test('competence follows the app rule, not the model', () => {
  assert.equal(TransactionParserService.normalize(raw({ date: '2026-11-03' }), context).month, '10/2026');
  assert.equal(TransactionParserService.normalize(raw({ date: '2026-11-19' }), context).month, '11/2026');
});

test('an unknown card is cleared and flagged', () => {
  const result = TransactionParserService.normalize(raw({ cardName: 'Inter' }), context);
  assert.equal(result.cardName, '');
  assert.match(result.notes, /Cartão não identificado/);
});

test('non-card types never carry card name or installments', () => {
  const result = TransactionParserService.normalize(raw({ type: 'cash', installments: 3 }), context);
  assert.equal(result.cardName, '');
  assert.equal(result.installments, 1);
});

test('invalid values fall back to safe defaults', () => {
  const result = TransactionParserService.normalize(raw({ type: 'bitcoin', amount: -5, date: 'ontem', category: '' }), context);
  assert.equal(result.type, 'cash');
  assert.equal(result.amount, 0);
  assert.equal(result.date, '2026-11-19');
  assert.equal(result.category, 'Outros');
  assert.match(result.notes, /Valor não identificado/);
});

test('a new category suggested by the model is kept', () => {
  assert.equal(TransactionParserService.normalize(raw({ category: 'Pets' }), context).category, 'Pets');
});

test('parse rejects empty and too long texts before calling the model', async () => {
  const service = new TransactionParserService('user', { generate: async () => assert.fail('model should not be called') });
  await assert.rejects(service.parse('   '), (error) => error.status === 400);
  await assert.rejects(service.parse('x'.repeat(301)), (error) => error.status === 400);
});

test('parse reports when the AI is not configured', async () => {
  await assert.rejects(new TransactionParserService('user', null).parse('30 de pizza'), (error) => error.status === 503);
});
