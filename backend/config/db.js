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
        
        let closingDay = 5;
        if (oldConfig && oldConfig.closingDay !== undefined) {
          closingDay = oldConfig.closingDay;
        }
        
        let dueDay = closingDay + 10;
        if (dueDay > 31) dueDay -= 31;
        
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
    
  } catch (err) {
    console.error('[Migration] Error migrating credit cards:', err);
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
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  migrateOrphans,
  migrateCreditCards
};
