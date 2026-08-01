const router = require('express').Router();
const ctrl = require('../controllers/financials.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { uploadApplicant } = require('../config/multer');

router.use(auth, rbac('admin'));
router.get('/summary', ctrl.getSummary);
router.get('/transactions', ctrl.listTransactions);
router.post('/transactions', ctrl.createTransaction);
router.put('/transactions/:id', ctrl.updateTransaction);
router.post('/transactions/:id/receipt', uploadApplicant.single('receipt'), ctrl.uploadReceipt);
router.get('/transactions/:id/receipt', ctrl.viewReceipt);

module.exports = router;
