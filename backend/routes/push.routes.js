const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/push.controller');

router.get('/status', auth, ctrl.status);
router.post('/subscribe', auth, ctrl.subscribe);
router.post('/unsubscribe', auth, ctrl.unsubscribe);
router.post('/test', auth, ctrl.test);

module.exports = router;
