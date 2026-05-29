// routes/auth.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const auth   = require('../middleware/auth');

router.post('/login',           ctrl.login);
router.post('/staff-login',     ctrl.staffLogin);
router.get ('/me',        auth, ctrl.getMe);
router.patch('/email',    auth, ctrl.changeEmail);
router.put ('/password',  auth, ctrl.changePassword);

module.exports = router;
