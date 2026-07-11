const mongoose = require('mongoose');

const CardConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  cardName: {
    type: String,
    required: true,
    trim: true
  },
  closingDay: {
    type: Number,
    required: true,
    min: 1,
    max: 31
  }
}, {
  timestamps: true
});

// A user can only have one configuration per card name
CardConfigSchema.index({ userId: 1, cardName: 1 }, { unique: true });

module.exports = mongoose.model('CardConfig', CardConfigSchema);
