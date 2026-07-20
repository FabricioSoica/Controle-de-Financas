const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ShoppingItem = require('../models/ShoppingItem');
const User = require('../models/User');
const CreditCard = require('../models/CreditCard');

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

const migrateCreditCards = async () => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections({ name: 'cardconfigs' }).toArray();
    
    let oldConfigs = [];
    if (collections.length > 0) {
      oldConfigs = await db.collection('cardconfigs').find({}).toArray();
      console.log(`[Migration] Found ${oldConfigs.length} old card configurations to migrate.`);
    }
    
    // Scan all transactions for unique cardName values
    const transCardNames = await Transaction.aggregate([
      { $match: { type: 'card', cardName: { $ne: '' } } },
      { $group: { _id: { userId: '$userId', cardName: '$cardName' } } }
    ]);
    
    // Scan all fuel refills for unique cardName values (dynamically import to avoid circular dependency)
    const FuelRefill = mongoose.model('FuelRefill');
    const fuelCardNames = await FuelRefill.aggregate([
      { $match: { paymentType: 'card', cardName: { $ne: '' } } },
      { $group: { _id: { userId: '$userId', cardName: '$cardName' } } }
    ]);
    
    // Combine all unique user-cardName pairs
    const allCardNames = new Map();
    
    const registerPair = (userId, cardName) => {
      if (!userId || !cardName) return;
      const normalized = cardName.trim();
      if (!normalized) return;
      const key = `${userId.toString()}_${normalized.toLowerCase()}`;
      if (!allCardNames.has(key)) {
        allCardNames.set(key, { userId, cardName: normalized });
      }
    };
    
    transCardNames.forEach(t => registerPair(t._id.userId, t._id.cardName));
    fuelCardNames.forEach(f => registerPair(f._id.userId, f._id.cardName));
    oldConfigs.forEach(c => registerPair(c.userId, c.cardName));
    
    let createdCount = 0;
    for (const pair of allCardNames.values()) {
      const existingCard = await CreditCard.findOne({ userId: pair.userId, cardName: pair.cardName });
      if (!existingCard) {
        const oldConfig = oldConfigs.find(c => c.userId.toString() === pair.userId.toString() && c.cardName.trim().toLowerCase() === pair.cardName.toLowerCase());
        
        let closingDay = 14;
        if (oldConfig && oldConfig.closingDay !== undefined) {
          closingDay = oldConfig.closingDay;
        }
        
        let dueDay = 15;
        if (oldConfig && oldConfig.dueDay !== undefined) {
          dueDay = oldConfig.dueDay;
        }
        
        const newCard = new CreditCard({
          userId: pair.userId,
          cardName: pair.cardName,
          closingDay,
          dueDay
        });
        
        await newCard.save();
        createdCount++;
      }
    }
    
    if (createdCount > 0) {
      console.log(`[Migration] Created ${createdCount} credit card configurations from existing transactions.`);
    }
    
    if (collections.length > 0) {
      await db.dropCollection('cardconfigs');
      console.log(`[Migration] Cleaned up and dropped old 'cardconfigs' collection.`);
    }
    
    // Force existing cards to close on 14 and due on 15 as requested
    const updateResult = await CreditCard.updateMany(
      {},
      { $set: { closingDay: 14, dueDay: 15 } }
    );
    if (updateResult.modifiedCount > 0) {
      console.log(`[Migration] Forced ${updateResult.modifiedCount} credit card configurations to closingDay 14 and dueDay 15.`);
    }
    
  } catch (err) {
    console.error('[Migration] Error migrating credit cards:', err);
  }
};

const migrateCategories = async () => {
  try {
    const transactions = await Transaction.find({
      $or: [
        { category: { $exists: false } },
        { category: 'Outros' }
      ]
    });
    
    if (transactions.length === 0) return;
    
    let updatedCount = 0;
    for (const t of transactions) {
      const desc = (t.description || '').toLowerCase();
      let cat = 'Outros';
      
      if (t.type === 'income') {
        if (desc.includes('salario') || desc.includes('salário') || desc.includes('pagamento') || desc.includes('tae') || desc.includes('taekwondo')) {
          cat = 'Salário';
        } else {
          cat = 'Outras Receitas';
        }
      } else {
        if (desc.includes('gasolina') || desc.includes('abastecer') || desc.includes('combustivel') || desc.includes('combustível')) {
          cat = 'Combustível';
        } else if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('amazon') || desc.includes('prime') || desc.includes('hbo') || desc.includes('disney') || desc.includes('youtube') || desc.includes('apple') || desc.includes('icloud') || desc.includes('github') || desc.includes('assinatura')) {
          cat = 'Assinaturas & Serviços';
        } else if (desc.includes('mercado') || desc.includes('ifood') || desc.includes('restaurante') || desc.includes('comida') || desc.includes('padaria') || desc.includes('pao') || desc.includes('pão') || desc.includes('açougue') || desc.includes('acougue')) {
          cat = 'Alimentação';
        } else if (desc.includes('uber') || desc.includes('99taxi') || desc.includes('bus') || desc.includes('passagem') || desc.includes('pedagio') || desc.includes('pedágio')) {
          cat = 'Transporte';
        } else if (desc.includes('aluguel') || desc.includes('condominio') || desc.includes('condomínio') || desc.includes('energia') || desc.includes('luz') || desc.includes('agua') || desc.includes('água') || desc.includes('internet') || desc.includes('iptu')) {
          cat = 'Moradia';
        } else if (desc.includes('cinema') || desc.includes('show') || desc.includes('viagem') || desc.includes('hotel') || desc.includes('cerveja') || desc.includes('chope') || desc.includes('bar') || desc.includes('praia')) {
          cat = 'Lazer / Viagens';
        } else if (desc.includes('farmacia') || desc.includes('farmácia') || desc.includes('medico') || desc.includes('médico') || desc.includes('hospital') || desc.includes('consulta') || desc.includes('remedio') || desc.includes('remédio') || desc.includes('dentista')) {
          cat = 'Saúde';
        } else if (desc.includes('curso') || desc.includes('faculdade') || desc.includes('escola') || desc.includes('livro') || desc.includes('mensalidade')) {
          cat = 'Educação';
        } else if (desc.includes('roupa') || desc.includes('calcado') || desc.includes('calçado') || desc.includes('tenis') || desc.includes('tênis') || desc.includes('shopee') || desc.includes('aliexpress') || desc.includes('shein') || desc.includes('mercado livre') || desc.includes('loja')) {
          cat = 'Compras / Vestuário';
        }
      }
      
      if (t.category !== cat) {
        t.category = cat;
        await t.save();
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`[Migration] Categorized ${updatedCount} transactions.`);
    }

    // Sync installments categories that might have been partially categorized
    const categorizedInstallments = await Transaction.find({
      type: 'card',
      description: { $regex: / \(\d{2}\/\d{2}\)$/ },
      category: { $ne: 'Outros', $exists: true }
    });

    let syncCount = 0;
    for (const t of categorizedInstallments) {
      const baseName = t.description.split(' (')[0].trim();
      const escapedName = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      const result = await Transaction.updateMany({
        userId: t.userId,
        type: 'card',
        cardName: t.cardName,
        description: { $regex: new RegExp('^' + escapedName + ' \\(') },
        category: { $ne: t.category }
      }, {
        $set: { category: t.category }
      });
      syncCount += result.modifiedCount;
    }
    if (syncCount > 0) {
      console.log(`[Migration] Synchronized category for ${syncCount} matching installments.`);
    }
  } catch (err) {
    console.error('[Migration] Error migrating categories:', err);
  }
};

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('ERRO CRÍTICO: A variável de ambiente MONGO_URI não está definida!');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Successfully connected to MongoDB.');
    // Run DB migrations for existing/orphan data
    await migrateOrphans();
    // Run DB migrations for credit cards
    await migrateCreditCards();
    // Run DB migrations for categories
    await migrateCategories();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  migrateOrphans,
  migrateCreditCards,
  migrateCategories
};
