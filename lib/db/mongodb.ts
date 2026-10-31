import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose | null> | null;
  lastFailureTime: number;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || {
  conn: null,
  promise: null,
  lastFailureTime: 0,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

const FAILURE_COOLDOWN_MS = 30000; // 30s cooldown before retrying MongoDB if unreachable

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!MONGODB_URI || MONGODB_URI.includes('demoUser') || MONGODB_URI.includes('example')) {
    // Demo placeholder detected
    return null;
  }

  if (cached.conn) {
    return cached.conn;
  }

  // Fast-fail if recent connection attempt failed (avoids 5s latency on every call)
  if (Date.now() - cached.lastFailureTime < FAILURE_COOLDOWN_MS) {
    return null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 2500,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        cached.lastFailureTime = 0;
        return mongooseInstance;
      })
      .catch((err) => {
        console.warn('[DB] MongoDB connection unavailable (using in-memory store):', err.message);
        cached.lastFailureTime = Date.now();
        cached.promise = null;
        return null;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch {
    cached.conn = null;
    cached.lastFailureTime = Date.now();
  }

  return cached.conn;
}
