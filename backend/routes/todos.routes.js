const router = require('express').Router();
const ctrl = require('../controllers/todos.controller');
const auth = require('../middleware/auth');

router.get('/', auth, ctrl.getTodos);
router.post('/', auth, ctrl.createTodo);
router.put('/:id', auth, ctrl.updateTodo);
router.delete('/:id', auth, ctrl.deleteTodo);
router.patch('/:id/complete', auth, ctrl.completeTodo);
router.patch('/:id/reopen', auth, ctrl.reopenTodo);

module.exports = router;
