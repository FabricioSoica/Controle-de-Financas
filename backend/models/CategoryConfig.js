const mongoose = require('mongoose');

const CategoryConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

CategoryConfigSchema.index({ userId: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('CategoryConfig', CategoryConfigSchema);
