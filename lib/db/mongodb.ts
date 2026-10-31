import mongoose from 'mongoose';
import { UserModel } from './models/user.model';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  const uri = (process.env.MONGODB_URI || '').replace(/^["']|["']$/g, '').trim();

  if (!uri || uri.includes('demoUser') || uri.includes('replace')) {
    throw new Error('MONGODB_URI is not configured in .env with real credentials.');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    console.log('[DB] Connecting to MongoDB Atlas cluster...');
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    };

    cached.promise = mongoose
      .connect(uri, opts)
      .then(async (mongooseInstance) => {
        console.log('[DB] >>> SUCCESSFULLY CONNECTED TO MONGODB ATLAS CLUSTER! <<<');
        try {
          await UserModel.createCollection();
          await UserModel.init();
          console.log('[DB] Verified "users" collection exists in Atlas database.');
        } catch {
          // ignore if already exists
        }
        return mongooseInstance;
      })
      .catch((err) => {
        console.error('[DB] CRITICAL: Failed to connect to MongoDB Atlas cluster:', err.message);
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.conn = null;
    throw err;
  }
}
