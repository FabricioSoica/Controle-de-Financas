const { GoogleGenAI } = require('@google/genai');
const HttpError = require('../../utils/HttpError');

const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 1000;
const TRANSIENT_STATUSES = [500, 502, 503, 504];
// System instructions and preview models are only served by the v1beta API
const API_VERSION = 'v1beta';

// Tries each model in order; a model that ran out of quota is skipped for a while so
// requests don't wait on a known failure. The last model is always tried.
class GeminiJsonModel {
  constructor({ apiKey, models, client = null, now = () => Date.now(), wait = (ms) => new Promise(r => setTimeout(r, ms)) }) {
    if (!models || models.length === 0) throw new Error('GeminiJsonModel requires at least one model');
    this.models = models;
    this.now = now;
    this.wait = wait;
    this.unavailableUntil = new Map();
    this.client = client || new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: API_VERSION, timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 1 } }
    });
  }

  async generate({ systemInstruction, prompt, schema }) {
    const failures = [];

    for (const [index, model] of this.models.entries()) {
      const isLastModel = index === this.models.length - 1;
      if (!isLastModel && this.isCoolingDown(model)) continue;

      try {
        return await this.generateWithRetry(model, { systemInstruction, prompt, schema });
      } catch (error) {
        if (error.status === 429) this.unavailableUntil.set(model, this.now() + QUOTA_COOLDOWN_MS);
        failures.push({ model, status: error.status, message: String(error.message).slice(0, 200) });
      }
    }

    console.error('[AI] All models failed:', failures.map(f => `${f.model} ${f.status || ''}: ${f.message}`).join(' | '));
    const lastFailure = failures[failures.length - 1];
    if (lastFailure && lastFailure.status === 429) {
      throw new HttpError(429, 'Limite de uso gratuito da IA atingido. Aguarde cerca de um minuto e tente novamente.');
    }
    throw new HttpError(503, 'O assistente de IA está indisponível no momento. Tente novamente em instantes.');
  }

  async generateWithRetry(model, request) {
    try {
      return await this.request(model, request);
    } catch (error) {
      if (!TRANSIENT_STATUSES.includes(error.status)) throw error;
      await this.wait(TRANSIENT_RETRY_DELAY_MS);
      return this.request(model, request);
    }
  }

  async request(model, { systemInstruction, prompt, schema }) {
    const response = await this.client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: schema
      }
    });
    return { data: JSON.parse(response.text), model };
  }

  isCoolingDown(model) {
    return (this.unavailableUntil.get(model) || 0) > this.now();
  }
}

module.exports = GeminiJsonModel;
