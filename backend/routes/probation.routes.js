const router=require('express').Router(),ctrl=require('../controllers/probation.controller'),auth=require('../middleware/auth'),rbac=require('../middleware/rbac');
router.use(auth);router.get('/mine',ctrl.mine);router.get('/',rbac('admin','manager'),ctrl.list);router.post('/',rbac('admin','manager'),ctrl.create);router.put('/:id',rbac('admin','manager'),ctrl.update);module.exports=router;
