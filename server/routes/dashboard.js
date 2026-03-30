const express = require('express');
const { buildDashboardResponse } = require('../services/youtubeDashboard');

const router = express.Router();

function parseForceFlag(value) {
  return value === '1' || value === 'true' || value === true;
}

router.get('/', async (req, res) => {
  const filters = {
    region: req.query.region || 'US',
    window: req.query.window,
    windowAmount: req.query.windowAmount,
    windowUnit: req.query.windowUnit,
    search: req.query.search || '',
    force: parseForceFlag(req.query.force),
  };

  const payload = await buildDashboardResponse(filters);
  res.json(payload);
});

module.exports = router;
