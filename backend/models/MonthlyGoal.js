const mongoose = require('mongoose');

const MonthlyGoalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  month: {
    type: String,
    required: true, // Format: 'MM/YYYY', e.g., '06/2026'
    index: true
  },
  targetNetResult: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MonthlyGoal', MonthlyGoalSchema);
