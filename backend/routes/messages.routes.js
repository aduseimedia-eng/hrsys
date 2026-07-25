// routes/messages.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/messages.controller');
const auth   = require('../middleware/auth');

router.post('/',                  auth, ctrl.send);
router.post('/team',              auth, ctrl.sendTeam);
router.put ('/team/:id',          auth, ctrl.updateTeam);
router.delete('/team/:id',        auth, ctrl.removeTeam);
router.get ('/inbox',             auth, ctrl.getInbox);
router.get ('/team',              auth, ctrl.getTeam);
router.get ('/unread-count',      auth, ctrl.getUnreadCount);
router.get ('/conversation/:id',  auth, ctrl.getConversation);
router.put ('/:id',               auth, ctrl.update);
router.delete('/:id',             auth, ctrl.remove);

module.exports = router;
