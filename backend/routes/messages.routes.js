// routes/messages.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/messages.controller');
const auth   = require('../middleware/auth');

router.post('/',                  auth, ctrl.send);
router.get ('/inbox',             auth, ctrl.getInbox);
router.get ('/unread-count',      auth, ctrl.getUnreadCount);
router.get ('/conversation/:id',  auth, ctrl.getConversation);

module.exports = router;
