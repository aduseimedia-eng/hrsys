const router = require('express').Router();
const ctrl = require('../controllers/disciplinary.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth, rbac('admin', 'manager'));
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
