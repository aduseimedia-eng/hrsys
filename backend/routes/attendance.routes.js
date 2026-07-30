// routes/attendance.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/attendance.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');

router.post('/clock-in',   auth, ctrl.clockIn);
router.post('/clock-out',  auth, ctrl.clockOut);
router.get ('/today',      auth, ctrl.getToday);
router.get ('/my-history', auth, ctrl.getMyHistory);
router.post('/overtime', auth, ctrl.submitOvertime);
router.get ('/overtime/mine', auth, ctrl.getMyOvertime);
router.get ('/overtime/report', auth, rbac('admin','manager'), ctrl.getOvertimeReport);
router.patch('/overtime/:id/status', auth, rbac('admin','manager'), ctrl.updateOvertimeStatus);
router.get ('/overtime/settings', auth, ctrl.getOvertimeSettings);
router.put ('/overtime/settings', auth, rbac('admin'), ctrl.updateOvertimeSettings);
router.get ('/report',     auth, rbac('admin','manager'), ctrl.getReport);
router.get ('/summary',    auth, rbac('admin','manager'), ctrl.getSummary);
router.get ('/export',     auth, rbac('admin'), ctrl.exportReport);

module.exports = router;
