const { createClient } = require('redis');

let client;
let connectPromise;
let lastError = '';
let isVerified = false;

function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_PORT));
}

function buildRedisClient() {
  if (process.env.REDIS_URL) {
    return createClient({ url: process.env.REDIS_URL });
  }

  return createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
  });
}

async function getRedisClient() {
  if (!isRedisConfigured()) return null;

  if (!client) {
    client = buildRedisClient();
    client.on('error', (error) => {
      lastError = error.message;
    });
  }

  if (client.isOpen && isVerified) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = client
      .connect()
      .then(async () => {
        await client.ping();
        isVerified = true;
        lastError = '';
        connectPromise = null;
        return client;
      })
      .catch(async (error) => {
        isVerified = false;
        lastError = error.message;
        connectPromise = null;

        try {
          if (client?.isOpen) {
            await client.disconnect();
          }
        } catch {
          // Ignore disconnect errors and allow a later retry.
        }

        client = undefined;
        throw error;
      });
  }

  return connectPromise;
}

function getRedisStatus() {
  return {
    configured: isRedisConfigured(),
    connected: Boolean(client?.isOpen && isVerified),
    lastError: lastError || null,
  };
}

module.exports = { getRedisClient, getRedisStatus, isRedisConfigured };