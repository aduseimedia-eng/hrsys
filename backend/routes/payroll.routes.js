// routes/payroll.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/payroll.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');

router.get ('/mine',           auth, ctrl.getMine);
router.get ('/setup',          auth, rbac('admin'), ctrl.getGlobalSetup);
router.get ('/summary',        auth, rbac('admin'), ctrl.getSummary);
router.get ('/',               auth, rbac('admin'), ctrl.getAll);
router.post('/process',        auth, rbac('admin'), ctrl.processMonth);
router.put ('/:id',            auth, rbac('admin'), ctrl.updatePayroll);
router.patch('/:id/paid',      auth, rbac('admin'), ctrl.markPaid);
router.get ('/:id',            auth, ctrl.getPayslip);

module.exports = router;
