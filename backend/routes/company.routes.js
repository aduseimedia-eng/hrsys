const router = require("express").Router(),
  ctrl = require("../controllers/company.controller"),
  auth = require("../middleware/auth"),
  rbac = require("../middleware/rbac"),
  { uploadPhoto } = require("../config/multer");
router.get("/branding", auth, ctrl.getBranding);
router.get('/settings', auth, rbac('admin'), ctrl.getSettings);
router.get('/preferences', auth, ctrl.getSystemPreferences);
router.put('/settings', auth, rbac('admin'), ctrl.updateSettings);
router.put('/preferences', auth, rbac('admin'), ctrl.updateSystemPreferences);
router.put("/branding", auth, rbac("admin"), uploadPhoto.single("logo"), ctrl.updateBranding);
module.exports = router;
