const express = require('express');
const ShoppingItem = require('../models/ShoppingItem');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Apply authMiddleware to all shopping list routes
router.use(authMiddleware);

// Get shopping list items sorted by relevance/order
router.get('/', async (req, res) => {
  try {
    const items = await ShoppingItem.find({ userId: req.user.id }).sort({ order: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar lista de compras: ' + error.message });
  }
});

// Add a shopping list item
router.post('/', async (req, res) => {
  try {
    const { name, link, price } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'O nome do item é obrigatório.' });
    }
    
    // Find the highest current order value for this user to append at the end
    const lastItem = await ShoppingItem.findOne({ userId: req.user.id }).sort({ order: -1 });
    const nextOrder = lastItem ? lastItem.order + 1 : 0;

    const newItem = new ShoppingItem({
      userId: req.user.id,
      name,
      link: link || '',
      price: price ? parseFloat(price) : 0,
      order: nextOrder
    });
    
    const savedItem = await newItem.save();
    res.status(201).json(savedItem);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar item de compra: ' + error.message });
  }
});

// Update a shopping item
router.put('/:id', async (req, res) => {
  try {
    const { name, link, price, order } = req.body;
    const updatedFields = {};
    if (name !== undefined) updatedFields.name = name;
    if (link !== undefined) updatedFields.link = link;
    if (price !== undefined) updatedFields.price = parseFloat(price);
    if (order !== undefined) updatedFields.order = parseInt(order);

    const updatedItem = await ShoppingItem.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
    if (!updatedItem) {
      return res.status(404).json({ error: 'Item de compra não encontrado ou sem permissão.' });
    }
    res.json(updatedItem);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar item de compra: ' + error.message });
  }
});

// Batch update shopping list items order
router.post('/reorder', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids deve ser um array.' });
    }
    const bulkOps = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user.id },
        update: { $set: { order: index } }
      }
    }));
    await ShoppingItem.bulkWrite(bulkOps);
    res.json({ message: 'Lista de compras reordenada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao reordenar lista de compras: ' + error.message });
  }
});

// Delete a shopping item
router.delete('/:id', async (req, res) => {
  try {
    const deletedItem = await ShoppingItem.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.id 
    });
    if (!deletedItem) {
      return res.status(404).json({ error: 'Item de compra não encontrado ou sem permissão.' });
    }
    res.json({ message: 'Item deletado com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar item: ' + error.message });
  }
});

module.exports = router;
