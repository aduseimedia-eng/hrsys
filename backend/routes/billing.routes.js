const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/billing.controller');

router.get('/plans', ctrl.plans);
router.post('/webhook', ctrl.webhook);
router.get('/current', auth, rbac('admin'), ctrl.current);
router.post('/checkout', auth, rbac('admin'), ctrl.checkout);
router.get('/verify/:reference', auth, rbac('admin'), ctrl.verify);

module.exports = router;
