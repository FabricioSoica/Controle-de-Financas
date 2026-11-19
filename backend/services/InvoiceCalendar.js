const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const dateOnMonthDay = (year, monthIndex, day) => {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
};

const toISODate = (date) => date.toISOString().slice(0, 10);

class InvoiceCalendar {
  constructor(competenceStartDay) {
    this.competenceStartDay = competenceStartDay;
  }

  // Last day of a competence: the day before the next competence starts
  getCompetenceEndDate(competence) {
    const [monthStr, yearStr] = competence.split('/');
    const nextStart = dateOnMonthDay(parseInt(yearStr, 10), parseInt(monthStr, 10), this.competenceStartDay);
    return new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
  }

  getNextDayOnOrAfter(date, day) {
    const sameMonth = dateOnMonthDay(date.getUTCFullYear(), date.getUTCMonth(), day);
    return sameMonth >= date ? sameMonth : dateOnMonthDay(date.getUTCFullYear(), date.getUTCMonth() + 1, day);
  }

  getCompetenceDueDate(competence, dueDay) {
    return toISODate(this.getNextDayOnOrAfter(this.getCompetenceEndDate(competence), dueDay));
  }
}

module.exports = InvoiceCalendar;
