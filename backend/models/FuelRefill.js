const mongoose = require('mongoose');

const FuelRefillSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  odometer: {
    type: Number,
    required: true
  },
  liters: {
    type: Number,
    required: true
  },
  pricePerLiter: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  month: {
    type: String,
    required: true, // Format: 'MM/YYYY', e.g., '07/2026'
    index: true
  },
  paymentType: {
    type: String,
    enum: ['money', 'card'],
    default: 'money'
  },
  cardName: {
    type: String,
    trim: true,
    default: ''
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  info: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FuelRefill', FuelRefillSchema);
