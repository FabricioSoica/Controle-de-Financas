const CreditCard = require('../models/CreditCard');
const Transaction = require('../models/Transaction');
const { getCompetenceStartDay, getCompetenceMonth, toCompetenceKey } = require('../utils/competence');

const round = (value) => parseFloat(value.toFixed(2));
const normalizeCardName = (name) => (name || '').trim().toLowerCase();

class CardLimitService {
  constructor(userId) {
    this.userId = userId;
  }

  async getSummary(referenceDate = new Date()) {
    const startDay = await getCompetenceStartDay(this.userId);
    const currentKey = toCompetenceKey(getCompetenceMonth(referenceDate, startDay));

    const [cards, transactions] = await Promise.all([
      CreditCard.find({ userId: this.userId }).sort({ cardName: 1 }).lean(),
      Transaction.find({
        userId: this.userId,
        $or: [{ type: 'card' }, { type: 'fixed', cardName: { $nin: ['', null] } }]
      }).select('amount cardName month type').lean()
    ]);

    const usedByCard = this.sumOpenAmountsByCard(transactions, currentKey);
    const cardSummaries = cards.map(card => this.buildCardSummary(card, usedByCard.get(normalizeCardName(card.cardName)) || 0));

    return {
      competence: getCompetenceMonth(referenceDate, startDay),
      cards: cardSummaries,
      totals: this.buildTotals(cardSummaries)
    };
  }

  // Installments occupy the limit until their invoice is paid, so every card purchase from the
  // current competence on counts; fixed subscriptions only take limit once charged (current competence)
  sumOpenAmountsByCard(transactions, currentKey) {
    const usedByCard = new Map();

    for (const t of transactions) {
      const key = toCompetenceKey(t.month);
      const isOpen = t.type === 'card' ? key >= currentKey : key === currentKey;
      if (!isOpen) continue;

      const cardKey = normalizeCardName(t.cardName);
      usedByCard.set(cardKey, (usedByCard.get(cardKey) || 0) + t.amount);
    }

    return usedByCard;
  }

  buildCardSummary(card, used) {
    const limit = card.limit || 0;
    return {
      _id: card._id,
      cardName: card.cardName,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      limit: round(limit),
      used: round(used),
      available: round(limit - used),
      usagePercent: limit > 0 ? round((used / limit) * 100) : null
    };
  }

  buildTotals(cardSummaries) {
    const limit = cardSummaries.reduce((sum, c) => sum + c.limit, 0);
    const used = cardSummaries.reduce((sum, c) => sum + c.used, 0);
    return {
      limit: round(limit),
      used: round(used),
      available: round(limit - used),
      usagePercent: limit > 0 ? round((used / limit) * 100) : null
    };
  }
}

module.exports = CardLimitService;
