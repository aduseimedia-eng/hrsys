const router = require("express").Router(),
  ctrl = require("../controllers/company.controller"),
  auth = require("../middleware/auth"),
  rbac = require("../middleware/rbac"),
  { uploadPhoto } = require("../config/multer");
router.get("/branding", auth, ctrl.getBranding);
router.put("/branding", auth, rbac("admin"), uploadPhoto.single("logo"), ctrl.updateBranding);
module.exports = router;
