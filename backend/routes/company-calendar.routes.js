const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/company-calendar.controller');
router.get('/', auth, ctrl.list);
router.post('/', auth, rbac('admin'), ctrl.create);
router.delete('/:id', auth, rbac('admin'), ctrl.remove);
module.exports = router;
