// ============================================================
// HRConnect — Express Server Entry Point
// ============================================================
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const app = express();

// ─── Security & Middleware ────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static file serving (uploads) ───────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/employees',     require('./routes/employee.routes'));
app.use('/api/attendance',    require('./routes/attendance.routes'));
app.use('/api/leave',         require('./routes/leave.routes'));
app.use('/api/payroll',       require('./routes/payroll.routes'));
app.use('/api/documents',     require('./routes/documents.routes'));
app.use('/api/performance',   require('./routes/performance.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/messages',      require('./routes/messages.routes'));
app.use('/api/orgchart',      require('./routes/orgchart.routes'));
app.use('/api/todos',         require('./routes/todos.routes'));
app.use('/api/tickets',       require('./routes/tickets.routes'));

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
app.listen(PORT, () => console.log(`🚀 HRConnect API running on port ${PORT}`));
