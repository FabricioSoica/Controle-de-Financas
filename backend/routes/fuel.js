const express = require('express');
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

// GET /api/fuel/summary - Consumption averages per competence and overall
router.get('/summary', async (req, res) => {
  try {
    res.json(await new FuelRefillService(req.user.id).summary());
  } catch (error) {
    sendError(res, error, 'Erro ao buscar sumário de consumo');
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
