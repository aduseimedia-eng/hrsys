// routes/attendance.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/attendance.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');

router.post('/clock-in',   auth, ctrl.clockIn);
router.post('/clock-out',  auth, ctrl.clockOut);
router.get ('/today',      auth, ctrl.getToday);
router.get ('/my-history', auth, ctrl.getMyHistory);
router.get ('/report',     auth, rbac('admin','manager'), ctrl.getReport);
router.get ('/summary',    auth, rbac('admin','manager'), ctrl.getSummary);

module.exports = router;
