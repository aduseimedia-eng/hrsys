const router = require('express').Router();
const ctrl = require('../controllers/financials.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { uploadApplicant } = require('../config/multer');

router.use(auth, rbac('admin'));
router.get('/summary', ctrl.getSummary);
router.get('/cash-flow', ctrl.getCashFlow);
router.get('/transactions', ctrl.listTransactions);
router.post('/transactions', ctrl.createTransaction);
router.put('/transactions/:id', ctrl.updateTransaction);
router.patch('/transactions/:id/settle', ctrl.settleTransaction);
router.post('/transactions/:id/receipt', uploadApplicant.single('receipt'), ctrl.uploadReceipt);
router.get('/transactions/:id/receipt', ctrl.viewReceipt);

module.exports = router;
