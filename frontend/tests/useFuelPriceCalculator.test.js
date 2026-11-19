import test from 'node:test';
import assert from 'node:assert/strict';
import { useFuelPriceCalculator } from '../src/composables/useFuelPriceCalculator.js';

const createFields = (liters = '', price = '', total = '') => ({
  liters: { value: liters },
  price: { value: price },
  total: { value: total }
});

test('liters and total from the pump derive the price per liter', () => {
  const fields = createFields();
  const calculator = useFuelPriceCalculator(fields);
  fields.liters.value = 7.31; calculator.onInput('liters');
  fields.total.value = 45.1; calculator.onInput('total');
  assert.equal(fields.price.value, 6.17);
});

test('a single edited field does not change the others', () => {
  const fields = createFields();
  const calculator = useFuelPriceCalculator(fields);
  fields.price.value = 6.19; calculator.onInput('price');
  assert.equal(fields.liters.value, '');
  assert.equal(fields.total.value, '');
});

test('the two last edited fields are kept and the third is recalculated', () => {
  const fields = createFields();
  const calculator = useFuelPriceCalculator(fields);
  fields.price.value = 6.19; calculator.onInput('price');
  fields.liters.value = 5; calculator.onInput('liters');
  assert.equal(fields.total.value, 30.95);
  fields.total.value = 30; calculator.onInput('total');
  assert.equal(fields.price.value, 6);
  assert.equal(fields.liters.value, 5);
});

test('editing an existing refill keeps liters and total as reference', () => {
  const fields = createFields(4.04, 6.17, 24.93);
  const calculator = useFuelPriceCalculator(fields);
  calculator.startEditing();
  fields.total.value = 25; calculator.onInput('total');
  assert.equal(fields.liters.value, 4.04);
  assert.equal(fields.price.value, 6.188);
});
