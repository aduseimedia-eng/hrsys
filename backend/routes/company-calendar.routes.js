const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/company-calendar.controller');
router.get('/', auth, ctrl.list);
router.post('/', auth, rbac('admin', 'manager'), ctrl.create);
router.patch('/:id', auth, rbac('admin', 'manager'), ctrl.update);
router.delete('/:id', auth, rbac('admin', 'manager'), ctrl.remove);
module.exports = router;
