// middleware/rbac.js — Role-based access control
// Usage: router.get('/admin-route', auth, rbac('admin'), handler)
//        router.get('/mgr-route',   auth, rbac('admin','manager'), handler)

module.exports = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
  }
  next();
};
