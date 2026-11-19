const FIELDS = ['liters', 'price', 'total'];
const PUMP_FIELDS = ['liters', 'total'];

// The two fields edited last are kept and the third one is derived from them
export const useFuelPriceCalculator = ({ liters, price, total }) => {
  const refs = { liters, price, total };
  let recentlyEdited = [];

  const valueOf = (field) => parseFloat(refs[field].value);
  const isFilled = (field) => valueOf(field) > 0;

  const derivations = {
    total: () => parseFloat((valueOf('liters') * valueOf('price')).toFixed(2)),
    price: () => parseFloat((valueOf('total') / valueOf('liters')).toFixed(3)),
    liters: () => parseFloat((valueOf('total') / valueOf('price')).toFixed(3))
  };

  const onInput = (field) => {
    recentlyEdited = [...recentlyEdited.filter(f => f !== field), field].slice(-2);
    if (recentlyEdited.length < 2 || !recentlyEdited.every(isFilled)) return;

    const target = FIELDS.find(f => !recentlyEdited.includes(f));
    refs[target].value = derivations[target]();
  };

  // An existing refill keeps the pump values (liters and total) as the reference
  const startEditing = () => {
    recentlyEdited = [...PUMP_FIELDS];
  };

  const reset = () => {
    recentlyEdited = [];
  };

  return { onInput, startEditing, reset };
};
