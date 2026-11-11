function createMemoryStore() {
  const events = [];
  return {
    async check() {},
    async close() {},
    async add(event) {
      events.push(structuredClone(event));
      return events.length;
    },
    async recent() {
      return { count: events.length, items: structuredClone(events.slice(-20)) };
    },
    async byOrder(orderId) {
      return structuredClone(events.filter((event) => event.orderId === orderId));
    }
  };
}

async function createPostgresStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('notifications-service schema'))");
    await client.query(`CREATE TABLE IF NOT EXISTS notification_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      order_id text NOT NULL,
      payload jsonb NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS notification_events_order_id_idx ON notification_events (order_id, id)');
    await client.query('COMMIT');
  } catch (error) {
    try {
      if (client) await client.query('ROLLBACK');
    } finally {
      if (client) client.release();
      await pool.end();
    }
    throw error;
  }
  client.release();
  return {
    async check() { await pool.query('SELECT 1'); },
    async close() { await pool.end(); },
    async add(event) {
      const result = await pool.query(`WITH inserted AS (
        INSERT INTO notification_events (order_id, payload) VALUES ($1, $2::jsonb) RETURNING id
      ) SELECT (SELECT count(*) FROM notification_events) + count(*) AS total FROM inserted`, [
        event.orderId, JSON.stringify(event)
      ]);
      return Number(result.rows[0].total);
    },
    async recent() {
      const result = await pool.query(`SELECT payload, count(*) OVER () AS total FROM notification_events
        ORDER BY id DESC LIMIT 20`);
      return {
        count: result.rows.length ? Number(result.rows[0].total) : 0,
        items: result.rows.map((row) => row.payload).reverse()
      };
    },
    async byOrder(orderId) {
      const result = await pool.query('SELECT payload FROM notification_events WHERE order_id = $1 ORDER BY id', [orderId]);
      return result.rows.map((row) => row.payload);
    }
  };
}

async function createStore() {
  if (process.env.DATABASE_URL) return createPostgresStore(process.env.DATABASE_URL);
  if (process.env.NODE_ENV === 'production' || (process.env.ENVIRONMENT_NAME && process.env.ENVIRONMENT_NAME !== 'local')) {
    throw new Error('DATABASE_URL is required outside the local environment');
  }
  return createMemoryStore();
}

module.exports = { createStore };
