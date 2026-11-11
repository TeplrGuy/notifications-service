require('./telemetry');
const express = require('express');
const { createStore } = require('./store');

const app = express();
const port = process.env.PORT || 3000;
let store;

app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await store.check();
    res.status(200).json({
      service: 'notifications-service',
      status: 'ok',
      environment: process.env.ENVIRONMENT_NAME || 'local'
    });
  } catch (error) {
    console.error('notifications-service health check failed', error);
    res.status(503).json({ service: 'notifications-service', status: 'unavailable' });
  }
});

app.post('/notifications/order-created', async (req, res, next) => {
  const event = req.body || {};
  if (!event.orderId || !event.customerId || !event.createdAt) {
    return res.status(400).json({ error: 'orderId, customerId, createdAt are required.' });
  }

  const enrichedEvent = {
    ...event,
    receivedAt: new Date().toISOString()
  };

  try {
    return res.status(202).json({ status: 'accepted', eventCount: await store.add(enrichedEvent) });
  } catch (error) {
    return next(error);
  }
});

app.get('/notifications/events', async (_req, res, next) => {
  try {
    res.status(200).json(await store.recent());
  } catch (error) {
    next(error);
  }
});

app.get('/notifications/order/:orderId', async (req, res, next) => {
  try {
    const items = await store.byOrder(req.params.orderId);
    return res.status(200).json({ orderId: req.params.orderId, count: items.length, items });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('notifications-service request failed', error);
  res.status(500).json({ error: 'internal_error' });
});

createStore().then((createdStore) => {
  store = createdStore;
  app.listen(port, () => console.log('notifications-service listening on port ' + port));
}).catch((error) => {
  console.error('notifications-service startup failed', error);
  process.exitCode = 1;
});
