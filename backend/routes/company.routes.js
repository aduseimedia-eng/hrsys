const router = require("express").Router(),
  ctrl = require("../controllers/company.controller"),
  auth = require("../middleware/auth"),
  rbac = require("../middleware/rbac");
router.get("/branding", auth, ctrl.getBranding);
router.put("/branding", auth, rbac("admin"), ctrl.updateBranding);
module.exports = router;
