export const DEFAULT_COMPETENCE_START_DAY = 15;

// Competence of a date as 'YYYY-MM' (month input format): from startDay onwards it is
// the date's own month, before startDay it still belongs to the previous month
export const getCompetenceYM = (date = new Date(), startDay = DEFAULT_COMPETENCE_START_DAY) => {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;

  if (date.getDate() < startDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${String(month).padStart(2, '0')}`;
};
