const express = require('express');
const FuelRefill = require('../models/FuelRefill');
const Transaction = require('../models/Transaction');
const CardConfig = require('../models/CardConfig');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Apply authMiddleware to all routes
router.use(authMiddleware);

// Helper to get month string (MM/YYYY) from a date object or ISO string (timezone-safe)
const getMonthString = (dateInput) => {
  const d = new Date(dateInput);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${month}/${year}`;
};

// Helper to calculate the billing competence month of a credit card based on its closingDay setting
const calculateCompetenceMonth = async (userId, cardName, dateInput) => {
  const d = new Date(dateInput);
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1; // 1-12
  const year = d.getUTCFullYear();
  
  const config = await CardConfig.findOne({ userId, cardName: cardName.trim() });
  if (config) {
    const closingDay = config.closingDay;
    if (day <= closingDay) {
      // It falls in the previous month's statement competence
      let prevMonth = month - 1;
      let prevYear = year;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear = year - 1;
      }
      return `${String(prevMonth).padStart(2, '0')}/${prevYear}`;
    }
  }
  
  // Default to purchase month
  return `${String(month).padStart(2, '0')}/${year}`;
};

// GET /api/fuel - Get all refills with calculated km/l
router.get('/', async (req, res) => {
  try {
    const refills = await FuelRefill.find({ userId: req.user.id }).sort({ date: 1, odometer: 1 });
    
    const calculatedRefills = [];
    for (let i = 0; i < refills.length; i++) {
      const current = refills[i].toObject();
      if (i === 0) {
        current.distanceTraveled = 0;
        current.kmPerLiter = 0;
      } else {
        const prev = refills[i - 1];
        const dist = current.odometer - prev.odometer;
        current.distanceTraveled = dist >= 0 ? dist : 0;
        current.kmPerLiter = current.liters > 0 && dist > 0 ? parseFloat((dist / current.liters).toFixed(2)) : 0;
      }
      calculatedRefills.push(current);
    }
    
    // Return sorted by date descending (newest first)
    calculatedRefills.reverse();
    res.json(calculatedRefills);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar abastecimentos: ' + error.message });
  }
});

// GET /api/fuel/summary - Get monthly summarized stats
router.get('/summary', async (req, res) => {
  try {
    const refills = await FuelRefill.find({ userId: req.user.id }).sort({ date: 1, odometer: 1 });
    const monthlySummary = {};
    
    for (let i = 0; i < refills.length; i++) {
      const current = refills[i];
      const m = current.month;
      
      if (!monthlySummary[m]) {
        monthlySummary[m] = {
          monthLabel: m,
          totalAmount: 0,
          totalLiters: 0,
          totalDistance: 0,
          refillCount: 0,
          validLitersForKm: 0,
          validDistanceForKm: 0
        };
      }
      
      monthlySummary[m].totalAmount += current.totalAmount;
      monthlySummary[m].totalLiters += current.liters;
      monthlySummary[m].refillCount += 1;
      
      if (i > 0) {
        const prev = refills[i - 1];
        const dist = current.odometer - prev.odometer;
        const distance = dist >= 0 ? dist : 0;
        
        monthlySummary[m].totalDistance += distance;
        monthlySummary[m].validDistanceForKm += distance;
        monthlySummary[m].validLitersForKm += current.liters;
      }
    }
    
    const result = Object.values(monthlySummary).map(sum => {
      const avgKmPerLiter = sum.validLitersForKm > 0 ? parseFloat((sum.validDistanceForKm / sum.validLitersForKm).toFixed(2)) : 0;
      return {
        monthLabel: sum.monthLabel,
        totalAmount: parseFloat(sum.totalAmount.toFixed(2)),
        totalLiters: parseFloat(sum.totalLiters.toFixed(2)),
        totalDistance: sum.totalDistance,
        refillCount: sum.refillCount,
        avgKmPerLiter
      };
    });
    
    // Sort summary by month (newest month first)
    result.sort((a, b) => {
      const [am, ay] = a.monthLabel.split('/');
      const [bm, by] = b.monthLabel.split('/');
      return `${by}-${bm}`.localeCompare(`${ay}-${am}`);
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar sumário de consumo: ' + error.message });
  }
});

// POST /api/fuel - Create a new refill record
router.post('/', async (req, res) => {
  try {
    const { date, odometer, liters, pricePerLiter, totalAmount, info, paymentType, cardName } = req.body;
    
    if (!date || odometer === undefined || liters === undefined || pricePerLiter === undefined || totalAmount === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: data, odômetro, litros, preço por litro e valor total são obrigatórios.' });
    }
    
    const month = getMonthString(date);
    let transactionId = null;
    const resolvedPaymentType = paymentType || 'money';
    
    // Link to credit card transaction if selected
    if (resolvedPaymentType === 'card' && cardName) {
      const competenceMonth = await calculateCompetenceMonth(req.user.id, cardName, date);
      
      const newTrans = new Transaction({
        userId: req.user.id,
        description: `Gasolina - ${info ? info.trim() : 'Abastecimento'}`,
        amount: parseFloat(totalAmount),
        type: 'card',
        cardName: cardName.trim(),
        month: competenceMonth,
        info: `Abastecimento de ${parseFloat(liters).toFixed(1)}L (Odômetro: ${parseFloat(odometer).toLocaleString('pt-BR')} km)`
      });
      
      const savedTrans = await newTrans.save();
      transactionId = savedTrans._id;
    }
    
    const newRefill = new FuelRefill({
      userId: req.user.id,
      date: new Date(date),
      odometer: parseFloat(odometer),
      liters: parseFloat(liters),
      pricePerLiter: parseFloat(pricePerLiter),
      totalAmount: parseFloat(totalAmount),
      month,
      paymentType: resolvedPaymentType,
      cardName: resolvedPaymentType === 'card' && cardName ? cardName.trim() : '',
      transactionId,
      info: info || ''
    });
    
    const savedRefill = await newRefill.save();
    res.status(201).json(savedRefill);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar registro de abastecimento: ' + error.message });
  }
});

// PUT /api/fuel/:id - Update an existing refill record
router.put('/:id', async (req, res) => {
  try {
    const { date, odometer, liters, pricePerLiter, totalAmount, info, paymentType, cardName } = req.body;
    
    const refill = await FuelRefill.findOne({ _id: req.params.id, userId: req.user.id });
    if (!refill) {
      return res.status(404).json({ error: 'Registro de abastecimento não encontrado ou sem permissão.' });
    }
    
    const oldPaymentType = refill.paymentType;
    const newPaymentType = paymentType !== undefined ? paymentType : oldPaymentType;
    const oldCardName = refill.cardName;
    const newCardName = cardName !== undefined ? cardName : oldCardName;
    const oldDate = refill.date;
    const newDate = date !== undefined ? new Date(date) : oldDate;
    const oldTotalAmount = refill.totalAmount;
    const newTotalAmount = totalAmount !== undefined ? parseFloat(totalAmount) : oldTotalAmount;
    const oldInfo = refill.info;
    const newInfo = info !== undefined ? info : oldInfo;
    const oldLiters = refill.liters;
    const newLiters = liters !== undefined ? parseFloat(liters) : oldLiters;
    const oldOdometer = refill.odometer;
    const newOdometer = odometer !== undefined ? parseFloat(odometer) : oldOdometer;
    
    let transactionId = refill.transactionId;
    
    if (newPaymentType === 'card' && newCardName) {
      const competenceMonth = await calculateCompetenceMonth(req.user.id, newCardName, newDate);
      
      const transPayload = {
        description: `Gasolina - ${newInfo ? newInfo.trim() : 'Abastecimento'}`,
        amount: newTotalAmount,
        type: 'card',
        cardName: newCardName.trim(),
        month: competenceMonth,
        info: `Abastecimento de ${newLiters.toFixed(1)}L (Odômetro: ${newOdometer.toLocaleString('pt-BR')} km)`
      };
      
      if (oldPaymentType === 'card' && transactionId) {
        // Update existing transaction
        await Transaction.findOneAndUpdate(
          { _id: transactionId, userId: req.user.id },
          { $set: transPayload }
        );
      } else {
        // Create new transaction
        const newTrans = new Transaction({
          userId: req.user.id,
          ...transPayload
        });
        const savedTrans = await newTrans.save();
        transactionId = savedTrans._id;
      }
    } else {
      // Paid in cash or card name removed, so remove transaction if it exists
      if (oldPaymentType === 'card' && transactionId) {
        await Transaction.findOneAndDelete({ _id: transactionId, userId: req.user.id });
        transactionId = null;
      }
    }
    
    const updatedFields = {
      paymentType: newPaymentType,
      cardName: newPaymentType === 'card' && newCardName ? newCardName.trim() : '',
      transactionId
    };
    
    if (date !== undefined) {
      updatedFields.date = newDate;
      updatedFields.month = getMonthString(date);
    }
    if (odometer !== undefined) updatedFields.odometer = newOdometer;
    if (liters !== undefined) updatedFields.liters = newLiters;
    if (pricePerLiter !== undefined) updatedFields.pricePerLiter = parseFloat(pricePerLiter);
    if (totalAmount !== undefined) updatedFields.totalAmount = newTotalAmount;
    if (info !== undefined) updatedFields.info = newInfo;
    
    const updatedRefill = await FuelRefill.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
    
    res.json(updatedRefill);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar registro de abastecimento: ' + error.message });
  }
});

// DELETE /api/fuel/:id - Delete a refill record
router.delete('/:id', async (req, res) => {
  try {
    const deletedRefill = await FuelRefill.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!deletedRefill) {
      return res.status(404).json({ error: 'Registro de abastecimento não encontrado ou sem permissão.' });
    }
    
    // Delete linked transaction if exists
    if (deletedRefill.transactionId) {
      await Transaction.findOneAndDelete({
        _id: deletedRefill.transactionId,
        userId: req.user.id
      });
    }
    
    res.json({ message: 'Registro de abastecimento excluído com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar registro de abastecimento: ' + error.message });
  }
});

module.exports = router;
