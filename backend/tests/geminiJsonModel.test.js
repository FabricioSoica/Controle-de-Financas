const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiJsonModel = require('../services/ai/GeminiJsonModel');

const apiError = (status) => Object.assign(new Error(`status ${status}`), { status });

const fakeClient = (behaviors) => {
  const calls = [];
  return {
    calls,
    models: {
      generateContent: async ({ model }) => {
        calls.push(model);
        const next = behaviors[model].shift();
        if (next instanceof Error) throw next;
        return { text: JSON.stringify(next) };
      }
    }
  };
};

const createModel = (client, clock = { now: 0 }) => new GeminiJsonModel({
  models: ['pro', 'flash'],
  client,
  now: () => clock.now,
  wait: async () => {}
});

const request = { systemInstruction: 's', prompt: 'p', schema: {} };

test('uses the primary model when it answers', async () => {
  const client = fakeClient({ pro: [{ ok: 1 }], flash: [] });
  const result = await createModel(client).generate(request);
  assert.deepEqual(result, { data: { ok: 1 }, model: 'pro' });
});

test('falls back to the next model when the primary fails', async () => {
  const client = fakeClient({ pro: [apiError(404)], flash: [{ ok: 2 }] });
  const result = await createModel(client).generate(request);
  assert.equal(result.model, 'flash');
});

test('a model out of quota is skipped until the cooldown ends', async () => {
  const clock = { now: 0 };
  const client = fakeClient({ pro: [apiError(429), { ok: 'pro' }], flash: [{ ok: 1 }, { ok: 2 }, { ok: 3 }] });
  const model = createModel(client, clock);

  await model.generate(request);
  await model.generate(request);
  assert.deepEqual(client.calls, ['pro', 'flash', 'flash']);

  clock.now = 11 * 60 * 1000;
  const result = await model.generate(request);
  assert.equal(result.model, 'pro');
});

test('the last model is always tried, even during its cooldown', async () => {
  const client = fakeClient({ pro: [apiError(429), apiError(429)], flash: [apiError(429), { ok: 1 }] });
  const model = createModel(client);
  await assert.rejects(model.generate(request), (error) => error.status === 429);
  const result = await model.generate(request);
  assert.equal(result.model, 'flash');
});

test('transient errors are retried once on the same model', async () => {
  const client = fakeClient({ pro: [apiError(503), { ok: 1 }], flash: [] });
  const result = await createModel(client).generate(request);
  assert.equal(result.model, 'pro');
  assert.deepEqual(client.calls, ['pro', 'pro']);
});

test('reports unavailability when every model fails', async () => {
  const client = fakeClient({ pro: [apiError(500), apiError(500)], flash: [apiError(404)] });
  await assert.rejects(createModel(client).generate(request), (error) => error.status === 503);
});
