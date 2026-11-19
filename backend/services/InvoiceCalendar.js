const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const dateOnMonthDay = (year, monthIndex, day) => {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  const y = normalized.getUTCFullYear();
  const m = normalized.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toISODate = (date) => date.toISOString().slice(0, 10);

const startOfUTCDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

class InvoiceCalendar {
  constructor(competenceStartDay) {
    this.competenceStartDay = competenceStartDay;
  }

  // Last day of a competence: the day before the next competence starts
  getCompetenceEndDate(competence) {
    const [monthStr, yearStr] = competence.split('/');
    const nextStart = dateOnMonthDay(parseInt(yearStr, 10), parseInt(monthStr, 10), this.competenceStartDay);
    return new Date(nextStart.getTime() - DAY_MS);
  }

  getNextDayOnOrAfter(date, day) {
    const sameMonth = dateOnMonthDay(date.getUTCFullYear(), date.getUTCMonth(), day);
    return sameMonth >= date ? sameMonth : dateOnMonthDay(date.getUTCFullYear(), date.getUTCMonth() + 1, day);
  }

  getCompetenceDueDate(competence, dueDay) {
    return toISODate(this.getNextDayOnOrAfter(this.getCompetenceEndDate(competence), dueDay));
  }

  // Purchases made on the closing day already go to the next invoice
  getPurchaseDueDate(purchaseDate, closingDay, dueDay) {
    const purchaseDay = startOfUTCDay(purchaseDate);
    const closingDate = this.getNextDayOnOrAfter(new Date(purchaseDay.getTime() + DAY_MS), closingDay);
    const dueDate = this.getNextDayOnOrAfter(new Date(closingDate.getTime() + DAY_MS), dueDay);
    return {
      dueDate: toISODate(dueDate),
      daysToPay: Math.round((dueDate - purchaseDay) / DAY_MS)
    };
  }
}

module.exports = InvoiceCalendar;
