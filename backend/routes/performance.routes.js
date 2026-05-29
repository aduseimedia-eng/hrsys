// routes/performance.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/performance.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');

router.post('/',                  auth, rbac('admin','manager'), ctrl.create);
router.get ('/mine',              auth, ctrl.getMine);
router.get ('/team-summary',      auth, rbac('admin','manager'), ctrl.getTeamSummary);
router.get ('/',                  auth, rbac('admin'), ctrl.getAll);
router.get ('/employee/:id',      auth, ctrl.getForEmployee);

module.exports = router;
