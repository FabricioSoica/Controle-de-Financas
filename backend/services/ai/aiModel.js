const GeminiJsonModel = require('./GeminiJsonModel');

const DEFAULT_MODELS = ['gemini-3.1-pro-preview', 'gemini-2.5-flash'];

let instance;

// Shared instance so the quota cooldown is remembered across requests; null when no key is configured
const getAiModel = () => {
  if (instance !== undefined) return instance;

  const apiKey = process.env.GEMINI_API_KEY;
  const models = process.env.GEMINI_MODELS
    ? process.env.GEMINI_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : DEFAULT_MODELS;

  instance = apiKey ? new GeminiJsonModel({ apiKey, models }) : null;
  return instance;
};

module.exports = { getAiModel };
