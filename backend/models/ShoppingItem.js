const mongoose = require('mongoose');

const ShoppingItemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  link: {
    type: String,
    trim: true,
    default: ''
  },
  price: {
    type: Number,
    default: 0
  },
  order: {
    type: Number,
    required: true,
    default: 0 // Used for dragging up/down to sort by relevance
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ShoppingItem', ShoppingItemSchema);
