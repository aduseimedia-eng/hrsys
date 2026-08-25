const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/payroll-runs.controller');

router.get('/', auth, rbac('admin'), ctrl.list);
router.post('/', auth, rbac('admin'), ctrl.create);
router.post('/:id/calculate', auth, rbac('admin'), ctrl.calculate);
router.post('/:id/transition', auth, rbac('admin'), ctrl.transition);

module.exports = router;
