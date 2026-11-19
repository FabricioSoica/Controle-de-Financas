const CreditCard = require('../models/CreditCard');
const Transaction = require('../models/Transaction');
const InvoiceCalendar = require('./InvoiceCalendar');
const {
  getCompetenceStartDay,
  getCompetenceMonth,
  toCompetenceKey,
  shiftCompetence
} = require('../utils/competence');

const INSTALLMENT_SUFFIX = /\((\d+)\/\d+\)\s*$/;

const round = (value) => parseFloat(value.toFixed(2));
const normalizeCardName = (name) => (name || '').trim().toLowerCase();
const sumAmounts = (transactions = []) => transactions.reduce((sum, t) => sum + t.amount, 0);

class CardLimitService {
  constructor(userId) {
    this.userId = userId;
  }

  async getSummary(competence = null) {
    const startDay = await getCompetenceStartDay(this.userId);
    const currentCompetence = getCompetenceMonth(new Date(), startDay);
    const targetCompetence = competence || currentCompetence;
    const targetKey = toCompetenceKey(targetCompetence);
    const calendar = new InvoiceCalendar(startDay);
    const today = new Date();

    const [cards, transactions] = await Promise.all([
      CreditCard.find({ userId: this.userId }).sort({ cardName: 1 }).lean(),
      Transaction.find({
        userId: this.userId,
        $or: [{ type: 'card' }, { type: 'fixed', cardName: { $nin: ['', null] } }]
      }).select('amount cardName month type description').lean()
    ]);

    const openByCard = this.groupByCard(transactions, t => this.isOpenAt(t, targetKey));
    const invoiceByCard = this.groupByCard(transactions, t => toCompetenceKey(t.month) === targetKey);

    const cardSummaries = cards.map(card => {
      const cardKey = normalizeCardName(card.cardName);
      return this.buildCardSummary(card, {
        used: sumAmounts(openByCard.get(cardKey)),
        invoiceAmount: sumAmounts(invoiceByCard.get(cardKey)),
        invoiceDueDate: calendar.getCompetenceDueDate(targetCompetence, card.dueDay),
        purchaseToday: calendar.getPurchaseDueDate(today, card.closingDay, card.dueDay)
      });
    });

    return {
      competence: targetCompetence,
      currentCompetence,
      cards: cardSummaries,
      totals: this.buildTotals(cardSummaries),
      bestCardForToday: this.findBestCardForToday(cardSummaries)
    };
  }

  // The card whose purchase today is paid the latest; none when every eligible card ties
  findBestCardForToday(cardSummaries) {
    const eligible = cardSummaries.filter(c => c.limit === 0 || c.available > 0);
    if (eligible.length < 2) return null;

    const maxDays = Math.max(...eligible.map(c => c.purchaseToday.daysToPay));
    const best = eligible.filter(c => c.purchaseToday.daysToPay === maxDays);
    return best.length < eligible.length ? best[0]._id : null;
  }

  // Position of the limit at the given competence: purchases made up to it whose installments are
  // still unpaid (its own invoice onwards), plus fixed subscriptions charged in it
  isOpenAt(transaction, targetKey) {
    const key = toCompetenceKey(transaction.month);
    if (transaction.type !== 'card') return key === targetKey;
    return key >= targetKey && this.getPurchaseCompetenceKey(transaction) <= targetKey;
  }

  // Installment "Notebook (09/18)" in 11/2026 was bought 8 competences earlier, in 03/2026
  getPurchaseCompetenceKey(transaction) {
    const match = INSTALLMENT_SUFFIX.exec(transaction.description || '');
    const installmentNumber = match ? parseInt(match[1], 10) : 1;
    return toCompetenceKey(shiftCompetence(transaction.month, -(installmentNumber - 1)));
  }

  groupByCard(transactions, predicate) {
    const groups = new Map();
    for (const t of transactions) {
      if (!predicate(t)) continue;
      const cardKey = normalizeCardName(t.cardName);
      if (!groups.has(cardKey)) groups.set(cardKey, []);
      groups.get(cardKey).push(t);
    }
    return groups;
  }

  buildCardSummary(card, { used, invoiceAmount, invoiceDueDate, purchaseToday }) {
    const limit = card.limit || 0;
    return {
      _id: card._id,
      cardName: card.cardName,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      limit: round(limit),
      used: round(used),
      available: round(limit - used),
      usagePercent: limit > 0 ? round((used / limit) * 100) : null,
      invoice: {
        amount: round(invoiceAmount),
        dueDate: invoiceDueDate
      },
      purchaseToday
    };
  }

  buildTotals(cardSummaries) {
    const limit = cardSummaries.reduce((sum, c) => sum + c.limit, 0);
    const used = cardSummaries.reduce((sum, c) => sum + c.used, 0);
    const invoiceAmount = cardSummaries.reduce((sum, c) => sum + c.invoice.amount, 0);
    return {
      limit: round(limit),
      used: round(used),
      available: round(limit - used),
      usagePercent: limit > 0 ? round((used / limit) * 100) : null,
      invoiceAmount: round(invoiceAmount)
    };
  }
}

module.exports = CardLimitService;
