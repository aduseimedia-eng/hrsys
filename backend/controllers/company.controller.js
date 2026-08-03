const db = require("../config/db");

const brandColumns = "logo_url, primary_color, accent_color, CASE WHEN logo_data IS NULL THEN NULL ELSE 'data:' || COALESCE(logo_mime_type,'image/png') || ';base64,' || encode(logo_data,'base64') END AS uploaded_logo";

exports.getBranding = async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT ${brandColumns} FROM companies WHERE id=$1`, [req.user.company_id]);
    res.json(rows[0] || {});
  } catch { res.status(500).json({ error: "Could not fetch company branding" }); }
};

exports.updateBranding = async (req, res) => {
  try {
    const { logo_url, primary_color, accent_color } = req.body;
    const { rows } = await db.query(`UPDATE companies SET logo_url=$1, primary_color=$2, accent_color=$3, logo_data=COALESCE($4,logo_data), logo_mime_type=COALESCE($5,logo_mime_type), updated_at=NOW() WHERE id=$6 RETURNING ${brandColumns}`,
      [String(logo_url || "").trim() || null, String(primary_color || "").trim() || null, String(accent_color || "").trim() || null, req.file?.buffer || null, req.file?.mimetype || null, req.user.company_id]);
    res.json(rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ error: "Could not save company branding" }); }
};
