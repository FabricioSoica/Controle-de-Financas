const express = require('express');
const FuelRefill = require('../models/FuelRefill');
const FuelRefillService = require('../services/FuelRefillService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const sendError = (res, error, fallbackMessage) => {
  const status = error.status || 500;
  res.status(status).json({ error: status === 500 ? `${fallbackMessage}: ${error.message}` : error.message });
};

// GET /api/fuel - Get all refills with calculated km/l (newest first)
router.get('/', async (req, res) => {
  try {
    res.json(await new FuelRefillService(req.user.id).list());
  } catch (error) {
    sendError(res, error, 'Erro ao buscar abastecimentos');
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

// POST /api/fuel - Create a refill and its linked transaction
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await new FuelRefillService(req.user.id).create(req.body));
  } catch (error) {
    sendError(res, error, 'Erro ao criar registro de abastecimento');
  }
});

// PUT /api/fuel/:id - Update a refill and keep its transaction in sync
router.put('/:id', async (req, res) => {
  try {
    res.json(await new FuelRefillService(req.user.id).update(req.params.id, req.body));
  } catch (error) {
    sendError(res, error, 'Erro ao atualizar registro de abastecimento');
  }
});

// DELETE /api/fuel/:id - Delete a refill and its transaction
router.delete('/:id', async (req, res) => {
  try {
    await new FuelRefillService(req.user.id).delete(req.params.id);
    res.json({ message: 'Registro de abastecimento excluído com sucesso.', id: req.params.id });
  } catch (error) {
    sendError(res, error, 'Erro ao deletar registro de abastecimento');
  }
});

module.exports = router;
