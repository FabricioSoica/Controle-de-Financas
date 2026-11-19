const round = (value) => parseFloat(value.toFixed(2));

class FuelConsumptionCalculator {
  // Refills must be sorted by date and odometer (oldest first)
  static annotate(refills) {
    return refills.map((refill, index) => {
      if (index === 0) return { ...refill, distanceTraveled: 0, kmPerLiter: 0 };

      const distance = Math.max(refill.odometer - refills[index - 1].odometer, 0);
      const kmPerLiter = refill.liters > 0 && distance > 0 ? round(distance / refill.liters) : 0;
      return { ...refill, distanceTraveled: distance, kmPerLiter };
    });
  }
}

module.exports = FuelConsumptionCalculator;
