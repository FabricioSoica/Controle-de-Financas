const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Day of the month on which a new competence starts (e.g. salary day).
  // Dates before this day still belong to the previous month's competence.
  competenceStartDay: {
    type: Number,
    min: 1,
    max: 28,
    default: 15
  },
  // Account balance informed by the user at balanceAnchorDate.
  // Current balance = balanceAnchor - account expenses created since then.
  balanceAnchor: {
    type: Number,
    default: null
  },
  balanceAnchorDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserSettings', UserSettingsSchema);
