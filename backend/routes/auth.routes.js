// routes/auth.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const auth   = require('../middleware/auth');

router.post('/login',           ctrl.login);
router.post('/login/otp/verify', ctrl.verifyHrLoginOtp);
router.post('/staff-login',     ctrl.staffLogin);
router.post('/staff-login/otp/verify', ctrl.verifyStaffLoginOtp);
router.post('/setup/otp/request', ctrl.requestSetupOtp);
router.post('/setup/otp/verify',  ctrl.verifySetupOtp);
router.post('/setup',           ctrl.setup);
router.get ('/me',        auth, ctrl.getMe);
router.patch('/email',    auth, ctrl.changeEmail);
router.put ('/password',  auth, ctrl.changePassword);

module.exports = router;
