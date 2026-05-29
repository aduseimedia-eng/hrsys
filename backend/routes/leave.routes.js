// routes/leave.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/leave.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');

router.post('/',             auth, ctrl.request);
router.get ('/mine',         auth, ctrl.getMyLeaves);
router.get ('/calendar',     auth, ctrl.getCalendar);
router.get ('/',             auth, rbac('admin','manager'), ctrl.getAll);
router.patch('/:id/status',  auth, rbac('admin','manager'), ctrl.updateStatus);

module.exports = router;
