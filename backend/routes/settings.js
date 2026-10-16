const express = require('express');
const UserSettings = require('../models/UserSettings');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/auth');
const { DEFAULT_COMPETENCE_START_DAY } = require('../utils/competence');

const router = express.Router();

router.use(authMiddleware);

// Expenses that leave the bank account: cash/debit, other expenses and fixed expenses not charged on a card.
// Incomes and card expenses (paid through the invoice) do not change the account balance.
const accountExpensesFilter = {
  $or: [
    { type: { $in: ['cash', 'variable'] } },
    { type: 'fixed', $or: [{ cardName: { $exists: false } }, { cardName: '' }, { cardName: null }] }
  ]
};

const toSettingsResponse = (settings) => ({
  competenceStartDay: settings ? settings.competenceStartDay : DEFAULT_COMPETENCE_START_DAY,
  balanceAnchor: settings ? settings.balanceAnchor : null,
  balanceAnchorDate: settings ? settings.balanceAnchorDate : null
});

// GET /api/settings - Get user settings (defaults if never saved)
router.get('/', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user.id });
    res.json(toSettingsResponse(settings));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações: ' + error.message });
  }
});

// PUT /api/settings - Update the competence start day
router.put('/', async (req, res) => {
  try {
    const startDay = parseInt(req.body.competenceStartDay, 10);
    if (isNaN(startDay) || startDay < 1 || startDay > 28) {
      return res.status(400).json({ error: 'O dia de início da competência deve ser entre 1 e 28.' });
    }

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { competenceStartDay: startDay } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(toSettingsResponse(settings));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configurações: ' + error.message });
  }
});

// GET /api/settings/balance - Current account balance: anchor minus account expenses effective since then
router.get('/balance', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user.id });
    if (!settings || settings.balanceAnchor === null || !settings.balanceAnchorDate) {
      return res.json({ configured: false });
    }

    // An expense affects the account from the latest of its creation date and the start of its
    // competence, so expenses planned for future months only count once their month begins
    const startDay = settings.competenceStartDay;
    const anchorDate = settings.balanceAnchorDate;
    const now = new Date();
    const expenses = await Transaction.find({ userId: req.user.id, ...accountExpensesFilter })
      .select('amount month createdAt')
      .lean();

    let total = 0;
    for (const t of expenses) {
      const [monthStr, yearStr] = (t.month || '').split('/');
      const competenceStart = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, startDay));
      const createdAt = new Date(t.createdAt);
      const effectiveDate = isNaN(competenceStart) || createdAt > competenceStart ? createdAt : competenceStart;
      if (effectiveDate >= anchorDate && effectiveDate <= now) {
        total += t.amount;
      }
    }

    const spentSinceAnchor = parseFloat(total.toFixed(2));
    res.json({
      configured: true,
      balanceAnchor: settings.balanceAnchor,
      balanceAnchorDate: settings.balanceAnchorDate,
      spentSinceAnchor,
      currentBalance: parseFloat((settings.balanceAnchor - spentSinceAnchor).toFixed(2))
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao calcular saldo: ' + error.message });
  }
});

// PUT /api/settings/balance - Set the current account balance (new anchor starting now)
router.put('/balance', async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount)) {
      return res.status(400).json({ error: 'Informe um valor de saldo válido.' });
    }

    await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { balanceAnchor: amount, balanceAnchorDate: new Date() } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ message: 'Saldo atualizado com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar saldo: ' + error.message });
  }
});

module.exports = router;
