const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ShoppingItem = require('../models/ShoppingItem');
const User = require('../models/User');

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
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  migrateOrphans
};
