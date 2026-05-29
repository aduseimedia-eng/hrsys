# HRConnect — HR Management System

A complete, production-ready HR Management web application built with Node.js, Express, PostgreSQL, and Vanilla JavaScript.

---

## Features

| Module | Capabilities |
|--------|-------------|
| **Authentication** | JWT login/logout, role-based access (Admin, Manager, Employee), bcrypt passwords |
| **Dashboard** | Live stats, clock widget, announcements, birthdays, quick actions |
| **Employees** | Full CRUD, profile photos, department management, search/filter |
| **Attendance** | Clock in/out, late detection, HR reports, history |
| **Leave** | Request/approve/reject, calendar view, overlap detection |
| **Payroll** | Auto-process from salaries, payslips, print/download |
| **Documents** | Upload/download with drag-and-drop, type categorisation |
| **Org Chart** | Interactive hierarchy tree + department grid |
| **Performance** | Star ratings, comments, team summary dashboard |
| **Messages** | Real-time-style inbox, conversations, notifications |
| **Notifications** | System-wide push for leave, payroll, birthdays, announcements |

---

## Tech Stack

- **Backend**: Node.js, Express.js, JWT, bcrypt, Multer, pg (node-postgres)
- **Frontend**: HTML5, CSS3 (custom design system), Vanilla JavaScript
- **Database**: PostgreSQL 14+
- **Fonts**: Sora (display) + DM Sans (body) via Google Fonts

---

## Project Structure

```
hr-management/
├── backend/
│   ├── config/         # DB pool & Multer config
│   ├── controllers/    # Business logic for all modules
│   ├── middleware/     # JWT auth & RBAC guards
│   ├── routes/         # Express route definitions
│   ├── uploads/        # Stored files (photos + documents)
│   ├── server.js       # Express app entry point
│   └── .env.example    # Environment variable template
├── frontend/
│   ├── css/main.css    # Complete design system
│   ├── js/api.js       # Fetch wrapper, helpers, sidebar
│   └── pages/          # All HTML pages
└── database/
    ├── schema.sql      # Full database schema
    └── seed.sql        # Demo data
```

---

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 2. Database Setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE hrconnect;"

# Run the schema
psql -U postgres -d hrconnect -f database/schema.sql

# Load demo data (optional)
psql -U postgres -d hrconnect -f database/seed.sql
```

### 3. Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# Install dependencies
npm install

# Start server
npm run dev         # development (nodemon)
npm start           # production
```

### 4. Frontend Setup

The frontend is plain HTML/CSS/JS. Serve it with any static file server:

```bash
# Using npx serve
npx serve frontend

# Or using Python
python3 -m http.server 3000 --directory frontend

# Or VS Code Live Server extension
```

### 5. Access the app

- Frontend: http://localhost:3000/pages/login.html
- API: http://localhost:5000/api

---

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | Password123! |
| Manager | kwame.mensah@company.com | Password123! |
| Employee | akosua.boateng@company.com | Password123! |

---

## API Reference

### Authentication
```
POST /api/auth/login          Login
GET  /api/auth/me             Get current user
PUT  /api/auth/password       Change password
```

### Employees
```
GET    /api/employees/dashboard     HR dashboard stats
GET    /api/employees               List all (admin/manager)
POST   /api/employees               Create employee (admin)
GET    /api/employees/:id           Get employee
PUT    /api/employees/:id           Update employee
PATCH  /api/employees/:id/deactivate  Deactivate (admin)
POST   /api/employees/me/photo      Upload profile photo
GET    /api/employees/departments   List departments
```

### Attendance
```
POST /api/attendance/clock-in    Clock in
POST /api/attendance/clock-out   Clock out
GET  /api/attendance/today       My status today
GET  /api/attendance/my-history  My history
GET  /api/attendance/report      HR report (admin/manager)
GET  /api/attendance/summary     Summary stats
```

### Leave
```
POST   /api/leave                Request leave
GET    /api/leave/mine           My leave history
GET    /api/leave/calendar       Approved leave calendar
GET    /api/leave                All requests (admin/manager)
PATCH  /api/leave/:id/status     Approve/reject (admin/manager)
```

### Payroll
```
GET   /api/payroll/mine          My payslips
GET   /api/payroll               All payroll (admin)
GET   /api/payroll/summary       Monthly summary (admin)
POST  /api/payroll/process       Process month (admin)
PATCH /api/payroll/:id/paid      Mark as paid (admin)
GET   /api/payroll/:id           Get single payslip
```

### Other Modules
```
# Documents
POST   /api/documents            Upload document
GET    /api/documents/mine       My documents
DELETE /api/documents/:id        Delete document

# Performance
POST /api/performance            Write review (admin/manager)
GET  /api/performance/mine       My reviews
GET  /api/performance/team-summary  Team overview (admin/manager)

# Messages
POST /api/messages               Send message
GET  /api/messages/inbox         Inbox overview
GET  /api/messages/conversation/:id  Conversation thread

# Notifications
GET   /api/notifications/mine         My notifications
PATCH /api/notifications/:id/read     Mark read
PATCH /api/notifications/read-all     Mark all read
POST  /api/notifications/announce     Post announcement (admin)
GET   /api/notifications/announcements  All announcements

# Org Chart
GET /api/orgchart/tree           Full hierarchy tree
GET /api/orgchart/departments    Department breakdown
```

---

## Role Permissions

| Feature | Employee | Manager | Admin |
|---------|----------|---------|-------|
| View own profile | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ |
| View all employees | ❌ | ✅ | ✅ |
| Create/deactivate employees | ❌ | ❌ | ✅ |
| Clock in/out | ✅ | ✅ | ✅ |
| View HR attendance report | ❌ | ✅ | ✅ |
| Request leave | ✅ | ✅ | ✅ |
| Approve/reject leave | ❌ | ✅ | ✅ |
| View own payslips | ✅ | ✅ | ✅ |
| Process payroll | ❌ | ❌ | ✅ |
| Write performance reviews | ❌ | ✅ | ✅ |
| Post announcements | ❌ | ❌ | ✅ |
| Upload documents | ✅ | ✅ | ✅ |

---

## Extending the System

### Adding a real-time clock-in notification
Install `socket.io` and emit events on clock-in from the attendance controller.

### Integrating email
Add `nodemailer` to backend and hook into the notification controller's `announce` method.

### Connecting a real AI API
The message composing system can call `https://api.anthropic.com/v1/messages` directly — the architecture is ready for it.

---

## Security Considerations

- All passwords are hashed with bcrypt (12 salt rounds)
- JWT tokens expire after 8 hours by default
- RBAC middleware protects every sensitive route
- File uploads are type-validated and size-limited
- Helmet.js sets security headers on all responses
- SQL queries use parameterised inputs — no raw string concatenation

---

## License

MIT — Free for personal and commercial use.
