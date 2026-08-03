const db = require("../config/db");
exports.getBranding = async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT logo_url, primary_color, accent_color FROM companies WHERE id=$1",
      [req.user.company_id],
    );
    res.json(rows[0] || {});
  } catch {
    res.status(500).json({ error: "Could not fetch company branding" });
  }
};
exports.updateBranding = async (req, res) => {
  try {
    const { logo_url, primary_color, accent_color } = req.body;
    const { rows } = await db.query(
      "UPDATE companies SET logo_url=$1, primary_color=$2, accent_color=$3, updated_at=NOW() WHERE id=$4 RETURNING logo_url, primary_color, accent_color",
      [
        String(logo_url || "").trim() || null,
        String(primary_color || "").trim() || null,
        String(accent_color || "").trim() || null,
        req.user.company_id,
      ],
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Could not save company branding" });
  }
};
