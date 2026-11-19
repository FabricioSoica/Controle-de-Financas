const round = (value) => parseFloat(value.toFixed(2));

class FuelConsumptionCalculator {
  // Refills must be sorted by date and odometer (oldest first). The km/l of a single refill is only
  // reliable between two full tanks; consumedLiters is the fuel that replaced the distance driven,
  // which is what averages use (the first refill only sets the starting point)
  static annotate(refills) {
    let lastFullTank = null;
    let litersSinceFullTank = 0;

    return refills.map((refill, index) => {
      const previous = refills[index - 1];
      const distanceTraveled = previous ? Math.max(refill.odometer - previous.odometer, 0) : 0;
      let kmPerLiter = null;

      if (lastFullTank) litersSinceFullTank += refill.liters;

      if (refill.fullTank) {
        const distanceSinceFullTank = lastFullTank ? refill.odometer - lastFullTank.odometer : 0;
        if (litersSinceFullTank > 0 && distanceSinceFullTank > 0) {
          kmPerLiter = round(distanceSinceFullTank / litersSinceFullTank);
        }
        lastFullTank = refill;
        litersSinceFullTank = 0;
      }

      return {
        ...refill,
        distanceTraveled,
        consumedLiters: previous ? refill.liters : 0,
        kmPerLiter
      };
    });
  }

  static summarize(annotatedRefills) {
    const totalDistance = annotatedRefills.reduce((sum, r) => sum + r.distanceTraveled, 0);
    const consumedLiters = annotatedRefills.reduce((sum, r) => sum + r.consumedLiters, 0);
    return {
      totalAmount: round(annotatedRefills.reduce((sum, r) => sum + r.totalAmount, 0)),
      totalLiters: round(annotatedRefills.reduce((sum, r) => sum + r.liters, 0)),
      totalDistance: round(totalDistance),
      refillCount: annotatedRefills.length,
      avgKmPerLiter: consumedLiters > 0 && totalDistance > 0 ? round(totalDistance / consumedLiters) : null
    };
  }
}

module.exports = FuelConsumptionCalculator;
