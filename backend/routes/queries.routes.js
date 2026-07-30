const router=require('express').Router(),ctrl=require('../controllers/queries.controller'),auth=require('../middleware/auth');
router.use(auth);router.get('/access',ctrl.access);router.post('/',ctrl.create);router.get('/mine',ctrl.mine);router.get('/queue',ctrl.queue);router.patch('/:id',ctrl.update);module.exports=router;
