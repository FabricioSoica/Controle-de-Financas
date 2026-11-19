const FuelRefill = require('../models/FuelRefill');
const Transaction = require('../models/Transaction');
const HttpError = require('../utils/HttpError');
const FuelConsumptionCalculator = require('./FuelConsumptionCalculator');
const { getCompetenceStartDay, getCompetenceMonth } = require('../utils/competence');

const PAYMENT_TYPES = ['money', 'card'];
const FUEL_CATEGORY = 'Transporte';

const formatDate = (date) => new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

class FuelRefillService {
  constructor(userId) {
    this.userId = userId;
  }

  async list() {
    const refills = await FuelRefill.find({ userId: this.userId }).sort({ date: 1, odometer: 1 }).lean();
    return FuelConsumptionCalculator.annotate(refills).reverse();
  }

  async create(input) {
    const data = this.parseInput(input);
    await this.assertOdometerConsistent(data.date, data.odometer);
    data.month = await this.getCompetence(data.date);

    const refill = await FuelRefill.create({ userId: this.userId, ...data, transactionId: null });
    try {
      await this.syncTransaction(refill);
      await refill.save();
    } catch (error) {
      await this.removeTransaction(refill.transactionId);
      await FuelRefill.deleteOne({ _id: refill._id });
      throw error;
    }
    return refill;
  }

  async update(id, input) {
    const refill = await this.findOwned(id);
    const data = this.parseInput(input, refill);
    await this.assertOdometerConsistent(data.date, data.odometer, refill._id);
    data.month = await this.getCompetence(data.date);

    Object.assign(refill, data);
    await this.syncTransaction(refill);
    await refill.save();
    return refill;
  }

  async delete(id) {
    const refill = await this.findOwned(id);
    await this.removeTransaction(refill.transactionId);
    await FuelRefill.deleteOne({ _id: refill._id });
    return refill;
  }

  async findByTransactionId(transactionId) {
    return FuelRefill.findOne({ userId: this.userId, transactionId });
  }

  // Keeps the refill in the history without a financial transaction
  async detachTransaction(transactionId) {
    const refill = await this.findByTransactionId(transactionId);
    if (!refill) return null;
    await this.removeTransaction(refill.transactionId);
    refill.transactionId = null;
    refill.registerInFinances = false;
    await refill.save();
    return refill;
  }

  async findOwned(id) {
    const refill = await FuelRefill.findOne({ _id: id, userId: this.userId });
    if (!refill) throw new HttpError(404, 'Registro de abastecimento não encontrado ou sem permissão.');
    return refill;
  }

  async getCompetence(date) {
    return getCompetenceMonth(date, await getCompetenceStartDay(this.userId));
  }

  parseInput(input, current = {}) {
    const pick = (field) => (input[field] !== undefined ? input[field] : current[field]);
    const toNumber = (field, label, { allowZero = false } = {}) => {
      const value = parseFloat(pick(field));
      if (isNaN(value) || value < 0 || (!allowZero && value === 0)) {
        throw new HttpError(400, `Informe um valor válido para ${label}.`);
      }
      return value;
    };

    const date = new Date(pick('date'));
    if (!pick('date') || isNaN(date)) throw new HttpError(400, 'Informe uma data válida para o abastecimento.');

    const paymentType = pick('paymentType') || 'money';
    if (!PAYMENT_TYPES.includes(paymentType)) throw new HttpError(400, 'Forma de pagamento inválida.');

    const cardName = paymentType === 'card' ? (pick('cardName') || '').trim() : '';
    if (paymentType === 'card' && !cardName) throw new HttpError(400, 'Selecione o cartão de crédito usado no abastecimento.');

    const registerInFinances = pick('registerInFinances');

    return {
      date,
      odometer: toNumber('odometer', 'o odômetro', { allowZero: true }),
      liters: toNumber('liters', 'os litros'),
      pricePerLiter: toNumber('pricePerLiter', 'o preço por litro'),
      totalAmount: toNumber('totalAmount', 'o valor total'),
      paymentType,
      cardName,
      info: (pick('info') || '').trim(),
      registerInFinances: registerInFinances === undefined ? true : Boolean(registerInFinances)
    };
  }

  // Same-day refills are not compared, since their order within the day is unknown
  async assertOdometerConsistent(date, odometer, excludeId = null) {
    const filter = { userId: this.userId };
    if (excludeId) filter._id = { $ne: excludeId };

    const previous = await FuelRefill.findOne({ ...filter, date: { $lt: date } }).sort({ date: -1, odometer: -1 });
    if (previous && odometer < previous.odometer) {
      throw new HttpError(400, `O odômetro (${odometer.toLocaleString('pt-BR')} km) é menor que o do abastecimento de ${formatDate(previous.date)} (${previous.odometer.toLocaleString('pt-BR')} km).`);
    }

    const next = await FuelRefill.findOne({ ...filter, date: { $gt: date } }).sort({ date: 1, odometer: 1 });
    if (next && odometer > next.odometer) {
      throw new HttpError(400, `O odômetro (${odometer.toLocaleString('pt-BR')} km) é maior que o do abastecimento de ${formatDate(next.date)} (${next.odometer.toLocaleString('pt-BR')} km).`);
    }
  }

  async syncTransaction(refill) {
    if (!refill.registerInFinances) {
      await this.removeTransaction(refill.transactionId);
      refill.transactionId = null;
      return;
    }

    const payload = this.buildTransactionPayload(refill);
    const existing = refill.transactionId
      ? await Transaction.findOne({ _id: refill.transactionId, userId: this.userId })
      : null;

    if (existing) {
      await Transaction.updateOne({ _id: existing._id }, { $set: payload });
      return;
    }

    const created = await Transaction.create({ userId: this.userId, ...payload, category: FUEL_CATEGORY });
    refill.transactionId = created._id;
  }

  // Category is only set on creation, so a category chosen later by the user is preserved
  buildTransactionPayload(refill) {
    const isCard = refill.paymentType === 'card';
    return {
      description: `Gasolina - ${refill.info || 'Abastecimento'}`,
      amount: refill.totalAmount,
      type: isCard ? 'card' : 'cash',
      cardName: isCard ? refill.cardName : '',
      month: refill.month,
      info: `Abastecimento de ${refill.liters.toFixed(1)}L (Odômetro: ${refill.odometer.toLocaleString('pt-BR')} km)`,
      fuelRefillId: refill._id
    };
  }

  async removeTransaction(transactionId) {
    if (transactionId) await Transaction.deleteOne({ _id: transactionId, userId: this.userId });
  }
}

module.exports = FuelRefillService;
