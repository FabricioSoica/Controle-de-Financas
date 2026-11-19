const test = require('node:test');
const assert = require('node:assert/strict');
const FuelConsumptionCalculator = require('../services/FuelConsumptionCalculator');

const refill = (odometer, liters, fullTank = false) => ({ odometer, liters, totalAmount: liters * 6, fullTank });

test('distance is measured from the previous refill and never negative', () => {
  const annotated = FuelConsumptionCalculator.annotate([refill(1000, 5), refill(1100, 4), refill(1100, 3)]);
  assert.deepEqual(annotated.map(r => r.distanceTraveled), [0, 100, 0]);
});

test('km/l of a refill only exists between two full tanks', () => {
  const annotated = FuelConsumptionCalculator.annotate([
    refill(0, 10, true),
    refill(100, 3),
    refill(300, 9, true),
    refill(400, 4)
  ]);
  assert.deepEqual(annotated.map(r => r.kmPerLiter), [null, null, 25, null]);
});

test('partial refills without full tanks never produce a per-refill km/l', () => {
  const annotated = FuelConsumptionCalculator.annotate([refill(0, 5), refill(100, 4), refill(200, 5)]);
  assert.ok(annotated.every(r => r.kmPerLiter === null));
});

test('average uses distance driven over liters that replaced it, ignoring the first refill', () => {
  const annotated = FuelConsumptionCalculator.annotate([
    refill(31448, 7.33), refill(31559, 4.04), refill(31668, 7.31), refill(31788, 4.09), refill(32057, 9.76)
  ]);
  const summary = FuelConsumptionCalculator.summarize(annotated);
  assert.equal(summary.totalDistance, 609);
  assert.equal(summary.avgKmPerLiter, 24.17);
});

test('average is null when there is no distance to measure', () => {
  const summary = FuelConsumptionCalculator.summarize(FuelConsumptionCalculator.annotate([refill(1000, 5)]));
  assert.equal(summary.avgKmPerLiter, null);
});
