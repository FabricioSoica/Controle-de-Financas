const FuelRefill = require('../models/FuelRefill');
const Transaction = require('../models/Transaction');

// Marks transactions owned by a refill; refills whose transaction no longer exists stay only in the fuel history
module.exports = {
  name: '2026-11-link-fuel-refill-transactions',
  async up() {
    const refills = await FuelRefill.find();

    for (const refill of refills) {
      const transaction = refill.transactionId
        ? await Transaction.findOne({ _id: refill.transactionId, userId: refill.userId })
        : null;

      if (transaction) {
        await Transaction.updateOne({ _id: transaction._id }, { $set: { fuelRefillId: refill._id } });
        refill.registerInFinances = true;
      } else {
        refill.transactionId = null;
        refill.registerInFinances = false;
      }
      await refill.save();
    }
  }
};
