// routes/documents.routes.js
const router = require('express').Router();
const ctrl   = require('../controllers/documents.controller');
const auth   = require('../middleware/auth');
const rbac   = require('../middleware/rbac');
const { uploadDoc } = require('../config/multer');

router.post('/',             auth, uploadDoc.single('document'), ctrl.upload);
router.get ('/mine',         auth, ctrl.getMine);
router.get ('/all',          auth, rbac('admin','manager'), ctrl.getAll);
router.get ('/employee/:id', auth, rbac('admin','manager'), ctrl.getForEmployee);
router.get ('/:id/download', auth, ctrl.download);
router.delete('/:id',        auth, ctrl.deleteDoc);

module.exports = router;
