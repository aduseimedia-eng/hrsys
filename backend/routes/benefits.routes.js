const router = require('express').Router();
const ctrl = require('../controllers/benefits.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.get('/', auth, ctrl.getAll);
router.post('/', auth, rbac('admin', 'manager'), ctrl.create);
router.put('/:id', auth, rbac('admin', 'manager'), ctrl.update);
router.delete('/:id', auth, rbac('admin', 'manager'), ctrl.remove);

module.exports = router;
