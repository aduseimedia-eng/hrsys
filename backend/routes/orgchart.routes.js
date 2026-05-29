// routes/orgchart.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/orgchart.controller');
const auth   = require('../middleware/auth');

router.get('/tree',        auth, ctrl.getTree);
router.get('/departments', auth, ctrl.getDepartments);

module.exports = router;
