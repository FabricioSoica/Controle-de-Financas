const express = require('express');
const CardConfig = require('../models/CardConfig');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All card configuration endpoints require authentication
router.use(authMiddleware);

// GET /api/cards/config - Get all card configurations for the user
router.get('/config', async (req, res) => {
  try {
    const configs = await CardConfig.find({ userId: req.user.id }).sort({ cardName: 1 });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações dos cartões: ' + error.message });
  }
});

// POST /api/cards/config - Add or update a card configuration
router.post('/config', async (req, res) => {
  try {
    const { cardName, closingDay } = req.body;
    
    if (!cardName || closingDay === undefined) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: nome do cartão e dia de fechamento são obrigatórios.' });
    }
    
    const day = parseInt(closingDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: 'O dia de fechamento deve ser um número inteiro de 1 a 31.' });
    }
    
    const normalizedCardName = cardName.trim();
    
    // Upsert the card configuration
    const config = await CardConfig.findOneAndUpdate(
      { userId: req.user.id, cardName: normalizedCardName },
      { $set: { closingDay: day } },
      { new: true, upsert: true, runValidators: true }
    );
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar configuração do cartão: ' + error.message });
  }
});

// DELETE /api/cards/config/:id - Delete a card configuration
router.delete('/config/:id', async (req, res) => {
  try {
    const deletedConfig = await CardConfig.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!deletedConfig) {
      return res.status(404).json({ error: 'Configuração do cartão não encontrada ou sem permissão.' });
    }
    
    res.json({ message: 'Configuração excluída com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir configuração do cartão: ' + error.message });
  }
});

module.exports = router;
