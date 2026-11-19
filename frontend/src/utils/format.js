const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatCurrency = (value) => currencyFormatter.format(value || 0);

export const formatShortDate = (isoDate) => {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
};
