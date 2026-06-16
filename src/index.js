const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const receivedEvents = [];
const eventsByOrderId = new Map();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    service: 'notifications-service',
    status: 'ok',
    environment: process.env.ENVIRONMENT_NAME || 'local'
  });
});

app.post('/notifications/order-created', (req, res) => {
  const event = req.body || {};
  if (!event.orderId || !event.customerId || !event.createdAt) {
    return res.status(400).json({ error: 'orderId, customerId, createdAt are required.' });
  }

  const enrichedEvent = {
    ...event,
    receivedAt: new Date().toISOString()
  };

  receivedEvents.push(enrichedEvent);
  const existing = eventsByOrderId.get(event.orderId) || [];
  existing.push(enrichedEvent);
  eventsByOrderId.set(event.orderId, existing);
  return res.status(202).json({ status: 'accepted', eventCount: receivedEvents.length });
});

app.get('/notifications/events', (_req, res) => {
  res.status(200).json({ count: receivedEvents.length, items: receivedEvents.slice(-20) });
});

app.get('/notifications/order/:orderId', (req, res) => {
  const items = eventsByOrderId.get(req.params.orderId) || [];
  return res.status(200).json({ orderId: req.params.orderId, count: items.length, items });
});

app.listen(port, () => {
  console.log('notifications-service listening on port ' + port);
});
