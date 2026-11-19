const mongoose = require('mongoose');

// Runs each named migration once, recording it in the "schemamigrations" collection
class MigrationRunner {
  constructor(connection = mongoose.connection) {
    this.collection = connection.db.collection('schemamigrations');
  }

  async run(migrations) {
    for (const migration of migrations) {
      if (await this.collection.findOne({ name: migration.name })) continue;

      await migration.up();
      await this.collection.insertOne({ name: migration.name, appliedAt: new Date() });
      console.log(`[Migration] Applied ${migration.name}`);
    }
  }
}

module.exports = MigrationRunner;
