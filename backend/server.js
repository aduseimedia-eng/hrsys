// ============================================================
// KenadHR — Express Server Entry Point
// ============================================================
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');
const { startBirthdayNotifier } = require('./services/birthday.service');

const app = express();

// ─── Security & Middleware ────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // The current browser app uses inline page scripts and event handlers.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"]
    }
  }
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true }));

// ─── Static file serving (uploads) ───────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/vendor/chartjs', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/company',       require('./routes/company.routes'));
app.use('/api/employees',     require('./routes/employee.routes'));
app.use('/api/attendance',    require('./routes/attendance.routes'));
app.use('/api/leave',         require('./routes/leave.routes'));
app.use('/api/payroll',       require('./routes/payroll.routes'));
app.use('/api/financials',    require('./routes/financials.routes'));
app.use('/api/audit',         require('./routes/audit.routes'));
app.use('/api/assets',        require('./routes/assets.routes'));
app.use('/api/benefits',      require('./routes/benefits.routes'));
app.use('/api/loans',         require('./routes/loans.routes'));
app.use('/api/recruitment',   require('./routes/recruitment.routes'));
app.use('/api/documents',     require('./routes/documents.routes'));
app.use('/api/performance',   require('./routes/performance.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/messages',      require('./routes/messages.routes'));
app.use('/api/orgchart',      require('./routes/orgchart.routes'));
app.use('/api/todos',         require('./routes/todos.routes'));
app.use('/api/tickets',       require('./routes/tickets.routes'));
app.use('/api/queries',       require('./routes/queries.routes'));
app.use('/api/training',      require('./routes/training.routes'));
app.use('/api/probation',     require('./routes/probation.routes'));
app.use('/api/contracts',     require('./routes/contracts.routes'));
app.use('/api/disciplinary',  require('./routes/disciplinary.routes'));
app.use('/api/operations',    require('./routes/operations.routes'));
app.use('/api/billing',       require('./routes/billing.routes'));
app.use('/api/company-calendar', require('./routes/company-calendar.routes'));
app.use('/api/schedules',     require('./routes/schedules.routes'));
app.use('/api/push',          require('./routes/push.routes'));

// Serve the browser application from the same Railway service in production.
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// The mock client contains development-only sample profiles and credentials.
// It is never exposed unless a local developer explicitly enables it.
app.get('/js/mock-api.js', (req, res, next) => {
  if (process.env.ALLOW_MOCK_API === 'true') return next();
  return res.status(404).json({ error: 'Route not found' });
});
// The public landing page lives at the project root; the app itself remains
// served from /pages and the other frontend static paths.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
app.use(express.static(frontendDir));
// Keep older message notifications working after the staff messages page moved.
app.get('/messages', (req, res) => res.redirect('/pages/messages.html'));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── 404 & Error handlers ─────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
startBirthdayNotifier();
app.listen(PORT, () => console.log(`🚀 KenadHR API running on port ${PORT}`));
