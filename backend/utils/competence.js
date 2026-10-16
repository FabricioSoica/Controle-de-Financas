const UserSettings = require('../models/UserSettings');

const DEFAULT_COMPETENCE_START_DAY = 15;

const getCompetenceStartDay = async (userId) => {
  const settings = await UserSettings.findOne({ userId });
  return settings ? settings.competenceStartDay : DEFAULT_COMPETENCE_START_DAY;
};

// Competence (MM/YYYY) of a date: from startDay onwards it is the date's own month,
// before startDay it still belongs to the previous month (timezone-safe, uses UTC parts)
const getCompetenceMonth = (dateInput, startDay = DEFAULT_COMPETENCE_START_DAY) => {
  const d = new Date(dateInput);
  let month = d.getUTCMonth() + 1;
  let year = d.getUTCFullYear();

  if (d.getUTCDate() < startDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return `${String(month).padStart(2, '0')}/${year}`;
};

module.exports = {
  DEFAULT_COMPETENCE_START_DAY,
  getCompetenceStartDay,
  getCompetenceMonth
};
