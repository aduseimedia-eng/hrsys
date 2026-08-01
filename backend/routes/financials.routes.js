const router = require('express').Router();
const ctrl = require('../controllers/financials.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth, rbac('admin'));
router.get('/summary', ctrl.getSummary);

module.exports = router;
