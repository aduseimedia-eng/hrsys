const router = require('express').Router();
const ctrl = require('../controllers/tickets.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.post('/', auth, ctrl.createTicket);
router.get('/mine', auth, ctrl.getMine);
router.get('/', auth, ctrl.getAll);
router.patch('/:id', auth, ctrl.updateTicket);

module.exports = router;
