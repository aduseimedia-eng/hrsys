const router = require('express').Router();
const ctrl = require('../controllers/employee-requests.controller');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);

module.exports = router;
