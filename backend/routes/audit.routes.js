const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const ctrl = require('../controllers/audit.controller');
router.get('/', auth, rbac('admin'), ctrl.list);
module.exports = router;
