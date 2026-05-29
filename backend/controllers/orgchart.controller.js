// controllers/orgchart.controller.js
const db = require('../config/db');

// ─── Get full org tree ────────────────────────────────────────
exports.getTree = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.job_title,
              e.photo_url, e.manager_id, e.department_id,
              d.name AS department_name, e.role
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.is_active = true
       ORDER BY e.manager_id NULLS FIRST, e.first_name`
    );

    // Build tree structure
    const map = {};
    const roots = [];

    rows.forEach(emp => {
      map[emp.id] = { ...emp, children: [] };
    });

    rows.forEach(emp => {
      if (emp.manager_id && map[emp.manager_id]) {
        map[emp.manager_id].children.push(map[emp.id]);
      } else {
        roots.push(map[emp.id]);
      }
    });

    res.json(roots);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch org chart' });
  }
};

// ─── Get department structure ─────────────────────────────────
exports.getDepartments = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.name,
              CONCAT(m.first_name,' ',m.last_name) AS manager_name,
              m.photo_url AS manager_photo, m.job_title AS manager_title,
              COUNT(e.id) AS employee_count,
              json_agg(json_build_object(
                'id', e.id, 'name', CONCAT(e.first_name,' ',e.last_name),
                'job_title', e.job_title, 'photo_url', e.photo_url
              ) ORDER BY e.first_name) FILTER (WHERE e.id IS NOT NULL) AS members
       FROM departments d
       LEFT JOIN employees m ON m.id = d.manager_id
       LEFT JOIN employees e ON e.department_id = d.id AND e.is_active=true AND e.id != d.manager_id
       GROUP BY d.id, m.first_name, m.last_name, m.photo_url, m.job_title
       ORDER BY d.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch departments' });
  }
};
