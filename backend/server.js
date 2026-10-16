require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection (includes migrations)
connectDB();

// Import Routes
const authRoutes = require('./routes/auth');
const financeRoutes = require('./routes/finances');
const shoppingRoutes = require('./routes/shopping');
const fuelRoutes = require('./routes/fuel');
const cardRoutes = require('./routes/cards');
const settingsRoutes = require('./routes/settings');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/fuel', fuelRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/settings', settingsRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
