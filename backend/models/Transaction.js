const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['income', 'fixed', 'card', 'variable'] // income = receita, fixed = gasto fixo, card = cartão, variable = outros gastos
  },
  cardName: {
    type: String,
    trim: true,
    default: '' // Used when type === 'card' to group card expenses
  },
  month: {
    type: String,
    required: true, // Format: 'MM/YYYY', e.g., '06/2026'
    index: true
  },
  info: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    required: true,
    default: 'Outros',
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', TransactionSchema);
