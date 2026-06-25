require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Transaction = require('./models/Transaction');
const ShoppingItem = require('./models/ShoppingItem');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'controle-financas-secret-key-12345';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://<USUARIO>:<SENHA>@<SEU_CLUSTER>.mongodb.net/?appName=ControleFinancas';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB.');
    // Run DB migrations for existing/orphan data
    migrateOrphans();
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// ==========================================
// DB MIGRATION FOR ORPHAN DATA
// ==========================================
const migrateOrphans = async () => {
  try {
    const firstUser = await User.findOne().sort({ createdAt: 1 });
    if (firstUser) {
      // Tie any transactions that don't have a userId to the first user
      const transResult = await Transaction.updateMany(
        { userId: { $exists: false } },
        { $set: { userId: firstUser._id } }
      );
      
      // Tie any shopping items that don't have a userId to the first user
      const shopResult = await ShoppingItem.updateMany(
        { userId: { $exists: false } },
        { $set: { userId: firstUser._id } }
      );
      
      if (transResult.modifiedCount > 0 || shopResult.modifiedCount > 0) {
        console.log(`[Migration] Tied ${transResult.modifiedCount} orphan transactions and ${shopResult.modifiedCount} orphan shopping items to user: ${firstUser.username}`);
      }
    }

    // Migrate cardName for any card transaction that has it missing/empty (set to description)
    const cardResult = await Transaction.updateMany(
      { type: 'card', $or: [{ cardName: { $exists: false } }, { cardName: '' }] },
      [
        { $set: { cardName: "$description" } }
      ]
    );
    if (cardResult.modifiedCount > 0) {
      console.log(`[Migration] Updated cardName for ${cardResult.modifiedCount} card transactions.`);
    }
  } catch (err) {
    console.error('[Migration] Error migrating orphan records:', err);
  }
};

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // decoded contains id and username
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};

// ==========================================
// AUTH ENDPOINTS
// ==========================================

// Register a new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }
    
    const normalizedUsername = username.trim().toLowerCase();
    const existingUser = await User.findOne({ username: normalizedUsername });
    if (existingUser) {
      return res.status(400).json({ error: 'Este usuário já está cadastrado.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username: normalizedUsername,
      password: hashedPassword
    });
    
    const savedUser = await newUser.save();
    
    // Run migration immediately so the first user instantly inherits any pre-existing orphan data
    await migrateOrphans();

    // Generate JWT
    const token = jwt.sign({ id: savedUser._id, username: savedUser.username }, JWT_SECRET, { expiresIn: '30d' });
    
    res.status(201).json({
      token,
      username: savedUser.username,
      userId: savedUser._id
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar usuário: ' + error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(400).json({ error: 'Usuário ou senha inválidos.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Usuário ou senha inválidos.' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      username: user.username,
      userId: user._id
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer login: ' + error.message });
  }
});

// Get current user session info
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar dados do usuário: ' + error.message });
  }
});

// ==========================================
// FINANCE ENDPOINTS (SECURED)
// ==========================================

// Get annual evolution summary (last 12 months)
app.get('/api/finances/summary/evolution', authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id });
    const monthlyData = {};

    transactions.forEach(t => {
      const m = t.month;
      if (!m) return;
      
      const [monthStr, yearStr] = m.split('/');
      const sortKey = `${yearStr}-${monthStr}`;
      
      if (!monthlyData[sortKey]) {
        monthlyData[sortKey] = {
          monthLabel: m,
          sortKey,
          income: 0,
          card: 0,
          fixed: 0,
          variable: 0
        };
      }
      
      if (t.type === 'income') monthlyData[sortKey].income += t.amount;
      else if (t.type === 'card') monthlyData[sortKey].card += t.amount;
      else if (t.type === 'fixed') monthlyData[sortKey].fixed += t.amount;
      else if (t.type === 'variable') monthlyData[sortKey].variable += t.amount;
    });

    const result = Object.values(monthlyData)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-12); // Keep only last 12 months

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar dados de evolução: ' + error.message });
  }
});

// Get all transactions for a specific month (e.g. "06/2026")
app.get('/api/finances/:month', authMiddleware, async (req, res) => {
  try {
    const month = req.params.month.replace(/[-_]/g, '/');
    const transactions = await Transaction.find({ 
      userId: req.user.id, 
      month 
    }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar lançamentos: ' + error.message });
  }
});

// Add a transaction
app.post('/api/finances', authMiddleware, async (req, res) => {
  try {
    const { description, amount, type, month, info, cardName } = req.body;
    if (!description || amount === undefined || !type || !month) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: descrição, valor, tipo e mês são obrigatórios.' });
    }
    
    // For card types, set cardName (fallback to description if empty)
    let finalCardName = '';
    if (type === 'card') {
      finalCardName = cardName && cardName.trim() ? cardName.trim() : description.trim();
    }

    const newTransaction = new Transaction({
      userId: req.user.id,
      description,
      amount: parseFloat(amount),
      type,
      cardName: finalCardName,
      month: month.replace(/[-_]/g, '/'),
      info: info || ''
    });
    
    const savedTransaction = await newTransaction.save();
    res.status(201).json(savedTransaction);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar lançamento: ' + error.message });
  }
});

// Update a transaction
app.put('/api/finances/:id', authMiddleware, async (req, res) => {
  try {
    const { description, amount, type, month, info, cardName } = req.body;
    const updatedFields = {};
    if (description !== undefined) updatedFields.description = description;
    if (amount !== undefined) updatedFields.amount = parseFloat(amount);
    if (type !== undefined) updatedFields.type = type;
    if (month !== undefined) updatedFields.month = month.replace(/[-_]/g, '/');
    if (info !== undefined) updatedFields.info = info;
    
    if (type === 'card' || (type === undefined && cardName !== undefined)) {
      // Handle cardName updates
      if (cardName !== undefined) {
        updatedFields.cardName = cardName.trim();
      } else if (description !== undefined) {
        updatedFields.cardName = description.trim();
      }
    } else if (type !== undefined && type !== 'card') {
      // Clear cardName if changing away from card type
      updatedFields.cardName = '';
    }

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
    if (!updatedTransaction) {
      return res.status(404).json({ error: 'Lançamento não encontrado ou sem permissão.' });
    }
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar lançamento: ' + error.message });
  }
});

// Delete a transaction
app.delete('/api/finances/:id', authMiddleware, async (req, res) => {
  try {
    const deletedTransaction = await Transaction.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.id 
    });
    if (!deletedTransaction) {
      return res.status(404).json({ error: 'Lançamento não encontrado ou sem permissão.' });
    }
    res.json({ message: 'Lançamento deletado com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar lançamento: ' + error.message });
  }
});


// ==========================================
// SHOPPING LIST ENDPOINTS (SECURED)
// ==========================================

// Get shopping list items sorted by relevance/order
app.get('/api/shopping', authMiddleware, async (req, res) => {
  try {
    const items = await ShoppingItem.find({ userId: req.user.id }).sort({ order: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar lista de compras: ' + error.message });
  }
});

// Add a shopping list item
app.post('/api/shopping', authMiddleware, async (req, res) => {
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
app.put('/api/shopping/:id', authMiddleware, async (req, res) => {
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
app.post('/api/shopping/reorder', authMiddleware, async (req, res) => {
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
app.delete('/api/shopping/:id', authMiddleware, async (req, res) => {
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
