// routes/employee.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/employee.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');
const { uploadPhoto } = require('../config/multer');

router.get  ('/photo/:id',          ctrl.getPhoto);

router.get  ('/dashboard',          auth, rbac('admin','manager'), ctrl.getDashboard);
router.get  ('/departments',        auth, ctrl.getDepartments);
router.post ('/departments',        auth, rbac('admin'), ctrl.createDepartment);
router.put  ('/departments/:id',    auth, rbac('admin'), ctrl.updateDepartment);
router.delete('/departments/:id',    auth, rbac('admin'), ctrl.deleteDepartment);
router.get  ('/directory',          auth, ctrl.getDirectory);
router.get  ('/',                   auth, rbac('admin','manager'), ctrl.getAll);
router.post ('/',                   auth, rbac('admin'), ctrl.create);
router.get  ('/:id/promotions',     auth, ctrl.getPromotions);
router.post ('/:id/promotions',     auth, rbac('admin'), ctrl.promote);
router.get  ('/:id',                auth, ctrl.getById);
router.put  ('/:id',                auth, ctrl.update);
router.patch('/:id/account',        auth, rbac('admin'), ctrl.resetAccount);
router.patch('/:id/deactivate',     auth, rbac('admin'), ctrl.deactivate);
router.post ('/me/photo',           auth, uploadPhoto.single('photo'), ctrl.uploadPhoto);

module.exports = router;
