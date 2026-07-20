const express = require('express');
const Transaction = require('../models/Transaction');
const MonthlyGoal = require('../models/MonthlyGoal');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Apply authMiddleware to all finance routes
router.use(authMiddleware);

// Helper to add months to a MM/YYYY string
const addMonths = (monthYearStr, monthsToAdd) => {
  const [monthStr, yearStr] = monthYearStr.split('/');
  let month = parseInt(monthStr, 10);
  let year = parseInt(yearStr, 10);

  month += monthsToAdd;
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  return `${String(month).padStart(2, '0')}/${year}`;
};

// Get annual evolution summary (last 12 months)
router.get('/summary/evolution', async (req, res) => {
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

// Get global goal for the user
router.get('/goal', async (req, res) => {
  try {
    let goal = await MonthlyGoal.findOne({ userId: req.user.id, month: 'global' });
    if (!goal) {
      return res.json({ targetNetResult: 0 });
    }
    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar meta: ' + error.message });
  }
});

// Set or update global goal for the user
router.post('/goal', async (req, res) => {
  try {
    const { targetNetResult } = req.body;
    if (targetNetResult === undefined) {
      return res.status(400).json({ error: 'Campo obrigatório ausente: valor da meta.' });
    }

    let goal = await MonthlyGoal.findOne({ userId: req.user.id, month: 'global' });
    if (goal) {
      goal.targetNetResult = parseFloat(targetNetResult);
      await goal.save();
    } else {
      goal = new MonthlyGoal({
        userId: req.user.id,
        month: 'global',
        targetNetResult: parseFloat(targetNetResult)
      });
      await goal.save();
    }
    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar meta: ' + error.message });
  }
});

// Get all uncategorized transactions (category = 'Outros' or empty) across all time for the user
router.get('/uncategorized', async (req, res) => {
  try {
    const transactions = await Transaction.find({
      userId: req.user.id,
      $or: [
        { category: 'Outros' },
        { category: { $exists: false } },
        { category: '' },
        { category: null }
      ]
    }).sort({ createdAt: -1 });

    const seenInstallments = new Set();
    const filtered = [];

    for (const t of transactions) {
      if (t.type === 'card' && t.description.includes(' (')) {
        const baseName = t.description.split(' (')[0].trim();
        const key = `${t.cardName || 'Geral'}_${baseName}`;
        if (seenInstallments.has(key)) {
          continue;
        }
        seenInstallments.add(key);
      }
      filtered.push(t);
    }

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar transações descategorizadas: ' + error.message });
  }
});

// Get all unique categories registered in any transaction for the user
router.get('/categories', async (req, res) => {
  try {
    const categories = await Transaction.distinct('category', { userId: req.user.id });
    res.json(categories || []);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar categorias: ' + error.message });
  }
});

// Get all transactions for a specific month (e.g. "06/2026")
router.get('/:month', async (req, res) => {
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

// Add a transaction (with optional support for installments)
router.post('/', async (req, res) => {
  try {
    const { description, amount, type, month, info, cardName, installments, category } = req.body;
    if (!description || amount === undefined || !type || !month) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: descrição, valor, tipo e mês são obrigatórios.' });
    }

    // For card or fixed types, set cardName (fallback to description if card has empty cardName)
    let finalCardName = '';
    if (type === 'card' || type === 'fixed') {
      finalCardName = cardName && cardName.trim() ? cardName.trim() : '';
      if (type === 'card' && !finalCardName) {
        finalCardName = description.trim();
      }
    }

    const monthFormatted = month.replace(/[-_]/g, '/');

    // If type === 'card' and installments is a valid number greater than 1
    if (type === 'card' && installments && parseInt(installments, 10) > 1) {
      const { isOldInstallment, currentInstallmentNumber } = req.body;
      const totalInstallments = parseInt(installments, 10);
      const startInstallment = (isOldInstallment && currentInstallmentNumber) ? parseInt(currentInstallmentNumber, 10) : 1;
      const totalAmount = parseFloat(amount);
      const installmentAmount = Math.floor((totalAmount / totalInstallments) * 100) / 100;
      const remainder = Math.round((totalAmount - (installmentAmount * totalInstallments)) * 100);

      const savedTransactions = [];

      for (let i = 1; i <= totalInstallments; i++) {
        let currentAmount = installmentAmount;
        if (i <= remainder) {
          currentAmount += 0.01;
        }
        currentAmount = parseFloat(currentAmount.toFixed(2));

        // Save only the current and future installments
        if (i >= startInstallment) {
          const targetMonth = addMonths(monthFormatted, i - startInstallment);
          const installmentDesc = `${description.trim()} (${String(i).padStart(2, '0')}/${String(totalInstallments).padStart(2, '0')})`;

          const newTransaction = new Transaction({
            userId: req.user.id,
            description: installmentDesc,
            amount: currentAmount,
            type,
            cardName: finalCardName,
            month: targetMonth,
            info: info || '',
            category: category || 'Outros'
          });

          const saved = await newTransaction.save();
          savedTransactions.push(saved);
        }
      }

      return res.status(201).json(savedTransactions);
    }

    // Normal non-installment flow
    const newTransaction = new Transaction({
      userId: req.user.id,
      description,
      amount: parseFloat(amount),
      type,
      cardName: finalCardName,
      month: monthFormatted,
      info: info || '',
      category: category || 'Outros'
    });

    const savedTransaction = await newTransaction.save();
    res.status(201).json(savedTransaction);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar lançamento: ' + error.message });
  }
});

// Update a transaction
router.put('/:id', async (req, res) => {
  try {
    const { description, amount, type, month, info, cardName, installments, category } = req.body;

    // Fetch the original transaction to check its status
    const originalTrans = await Transaction.findOne({ _id: req.params.id, userId: req.user.id });
    if (!originalTrans) {
      return res.status(404).json({ error: 'Lançamento não encontrado ou sem permissão.' });
    }

    const monthFormatted = (month || originalTrans.month).replace(/[-_]/g, '/');
    const targetType = type || originalTrans.type;

    // If type is card and installments is specified as > 1
    if (targetType === 'card' && installments && parseInt(installments, 10) > 1) {
      const totalInstallments = parseInt(installments, 10);
      const totalAmount = parseFloat(amount || originalTrans.amount);
      const installmentAmount = Math.floor((totalAmount / totalInstallments) * 100) / 100;
      const remainder = Math.round((totalAmount - (installmentAmount * totalInstallments)) * 100);

      const finalCardName = cardName && cardName.trim() ? cardName.trim() : (description || originalTrans.description).trim();

      // Update the first transaction (the one being edited)
      let firstAmount = installmentAmount;
      if (1 <= remainder) {
        firstAmount += 0.01;
      }
      firstAmount = parseFloat(firstAmount.toFixed(2));
      const firstDesc = `${(description || originalTrans.description).trim()} (01/${String(totalInstallments).padStart(2, '0')})`;

      originalTrans.description = firstDesc;
      originalTrans.amount = firstAmount;
      originalTrans.type = 'card';
      originalTrans.cardName = finalCardName;
      originalTrans.month = monthFormatted;
      originalTrans.info = info !== undefined ? info : originalTrans.info;
      originalTrans.category = category !== undefined ? category : originalTrans.category;

      const updatedFirst = await originalTrans.save();
      const savedTransactions = [updatedFirst];

      // Create N - 1 new transactions for subsequent months
      for (let i = 2; i <= totalInstallments; i++) {
        let currentAmount = installmentAmount;
        if (i <= remainder) {
          currentAmount += 0.01;
        }
        currentAmount = parseFloat(currentAmount.toFixed(2));

        const targetMonth = addMonths(monthFormatted, i - 1);
        const installmentDesc = `${(description || originalTrans.description).trim()} (${String(i).padStart(2, '0')}/${String(totalInstallments).padStart(2, '0')})`;

        const newTransaction = new Transaction({
          userId: req.user.id,
          description: installmentDesc,
          amount: currentAmount,
          type: 'card',
          cardName: finalCardName,
          month: targetMonth,
          info: info !== undefined ? info : (originalTrans.info || ''),
          category: category !== undefined ? category : (originalTrans.category || 'Outros')
        });

        const saved = await newTransaction.save();
        savedTransactions.push(saved);
      }

      return res.json(savedTransactions);
    }

    // Normal non-installment update flow
    const updatedFields = {};
    if (description !== undefined) updatedFields.description = description;
    if (amount !== undefined) updatedFields.amount = parseFloat(amount);
    if (type !== undefined) updatedFields.type = type;
    if (month !== undefined) updatedFields.month = month.replace(/[-_]/g, '/');
    if (info !== undefined) updatedFields.info = info;
    if (category !== undefined) updatedFields.category = category;

    if (targetType === 'card' || targetType === 'fixed') {
      if (cardName !== undefined) {
        updatedFields.cardName = cardName.trim();
      } else if (targetType === 'card' && description !== undefined) {
        updatedFields.cardName = description.trim();
      }
    } else if (type !== undefined && type !== 'card' && type !== 'fixed') {
      updatedFields.cardName = '';
    }

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: updatedFields },
      { new: true, runValidators: true }
    );

    // If we updated the category of an installment, update all other installments of the same chain
    if (category !== undefined && originalTrans.type === 'card' && originalTrans.description.includes(' (')) {
      const baseName = originalTrans.description.split(' (')[0].trim();
      const escapedName = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      await Transaction.updateMany(
        {
          userId: req.user.id,
          type: 'card',
          cardName: originalTrans.cardName,
          description: { $regex: new RegExp('^' + escapedName + ' \\(') }
        },
        { $set: { category } }
      );
    }

    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar lançamento: ' + error.message });
  }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
  try {
    const { deleteAll } = req.query;
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.id });
    if (!transaction) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    // Se for compra parcelada no cartão E o usuário escolheu apagar todas (deleteAll === 'true')
    if (deleteAll === 'true' && transaction.type === 'card' && transaction.description.includes(' (')) {
      const baseName = transaction.description.split(' (')[0].trim();
      const escapedName = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

      await Transaction.deleteMany({
        userId: req.user.id,
        type: 'card',
        cardName: transaction.cardName,
        description: { $regex: new RegExp('^' + escapedName + ' \\(') }
      });
    } else {
      await Transaction.deleteOne({ _id: transaction._id });
    }

    res.json({ message: 'Lançamento deletado com sucesso.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar lançamento: ' + error.message });
  }
});

module.exports = router;
