const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/schedules.controller');
router.get('/', auth, rbac('admin', 'manager'), ctrl.list);
router.post('/', auth, rbac('admin', 'manager'), ctrl.create);
router.post('/assignments', auth, rbac('admin', 'manager'), ctrl.assign);
router.get('/mine', auth, ctrl.mine);
module.exports = router;
