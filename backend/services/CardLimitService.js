const CreditCard = require('../models/CreditCard');
const Transaction = require('../models/Transaction');
const {
  getCompetenceStartDay,
  getCompetenceMonth,
  toCompetenceKey,
  shiftCompetence
} = require('../utils/competence');

const INSTALLMENT_SUFFIX = /\((\d+)\/\d+\)\s*$/;

const round = (value) => parseFloat(value.toFixed(2));
const normalizeCardName = (name) => (name || '').trim().toLowerCase();

class CardLimitService {
  constructor(userId) {
    this.userId = userId;
  }

  async getSummary(competence = null) {
    const startDay = await getCompetenceStartDay(this.userId);
    const currentCompetence = getCompetenceMonth(new Date(), startDay);
    const targetCompetence = competence || currentCompetence;

    const [cards, transactions] = await Promise.all([
      CreditCard.find({ userId: this.userId }).sort({ cardName: 1 }).lean(),
      Transaction.find({
        userId: this.userId,
        $or: [{ type: 'card' }, { type: 'fixed', cardName: { $nin: ['', null] } }]
      }).select('amount cardName month type description').lean()
    ]);

    const usedByCard = this.sumOpenAmountsByCard(transactions, toCompetenceKey(targetCompetence));
    const cardSummaries = cards.map(card => this.buildCardSummary(card, usedByCard.get(normalizeCardName(card.cardName)) || 0));

    return {
      competence: targetCompetence,
      currentCompetence,
      cards: cardSummaries,
      totals: this.buildTotals(cardSummaries)
    };
  }

  // Position of the limit at the given competence: purchases made up to it whose installments are
  // still unpaid (its own invoice onwards), plus fixed subscriptions charged in it
  sumOpenAmountsByCard(transactions, targetKey) {
    const usedByCard = new Map();

    for (const t of transactions) {
      const key = toCompetenceKey(t.month);
      const isOpen = t.type === 'card'
        ? key >= targetKey && this.getPurchaseCompetenceKey(t) <= targetKey
        : key === targetKey;
      if (!isOpen) continue;

      const cardKey = normalizeCardName(t.cardName);
      usedByCard.set(cardKey, (usedByCard.get(cardKey) || 0) + t.amount);
    }

    return usedByCard;
  }

  // Installment "Notebook (09/18)" in 11/2026 was bought 8 competences earlier, in 03/2026
  getPurchaseCompetenceKey(transaction) {
    const match = INSTALLMENT_SUFFIX.exec(transaction.description || '');
    const installmentNumber = match ? parseInt(match[1], 10) : 1;
    return toCompetenceKey(shiftCompetence(transaction.month, -(installmentNumber - 1)));
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
