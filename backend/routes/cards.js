const express = require('express');
const CreditCard = require('../models/CreditCard');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All card configuration endpoints require authentication
router.use(authMiddleware);

// GET /api/cards/config - Get all card configurations for the user (we keep the endpoint name /config or / to get list)
// We will route GET /config and GET / to return the same list so it's fully backwards compatible
router.get('/', async (req, res) => {
  try {
    const configs = await CreditCard.find({ userId: req.user.id }).sort({ cardName: 1 });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cartões de crédito: ' + error.message });
  }
});

router.get('/config', async (req, res) => {
  try {
    const configs = await CreditCard.find({ userId: req.user.id }).sort({ cardName: 1 });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações dos cartões: ' + error.message });
  }
});

// POST /api/cards/config - Add or update a card configuration
router.post('/config', async (req, res) => {
  try {
    const { cardName, closingDay, dueDay } = req.body;
    
    if (!cardName || closingDay === undefined || dueDay === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: nome do cartão, dia de fechamento e dia de vencimento são obrigatórios.' });
    }
    
    const closing = parseInt(closingDay, 10);
    const due = parseInt(dueDay, 10);
    
    if (isNaN(closing) || closing < 1 || closing > 31) {
      return res.status(400).json({ error: 'O dia de fechamento deve ser um número inteiro de 1 a 31.' });
    }
    if (isNaN(due) || due < 1 || due > 31) {
      return res.status(400).json({ error: 'O dia de vencimento deve ser um número inteiro de 1 a 31.' });
    }
    
    const normalizedCardName = cardName.trim();
    
    // Upsert the card configuration
    const config = await CreditCard.findOneAndUpdate(
      { userId: req.user.id, cardName: normalizedCardName },
      { $set: { closingDay: closing, dueDay: due } },
      { new: true, upsert: true, runValidators: true }
    );
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar cartão: ' + error.message });
  }
});

// DELETE /api/cards/config/:id - Delete a card configuration
router.delete('/config/:id', async (req, res) => {
  try {
    const deletedConfig = await CreditCard.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!deletedConfig) {
      return res.status(404).json({ error: 'Cartão de crédito não encontrado ou sem permissão.' });
    }
    
    res.json({ message: 'Cartão excluído com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir cartão de crédito: ' + error.message });
  }
});

module.exports = router;
