-- ============================================================
-- HRConnect - Seed Data
-- Run AFTER schema.sql
-- Demo passwords are all: Password123!
-- ============================================================

INSERT INTO companies (name, slug, email, phone, address) VALUES
  ('HRConnect Demo Company', 'hrconnect-demo', 'admin@company.com', '+233201234567', 'Accra, Ghana');

-- Departments
INSERT INTO departments (company_id, name) VALUES
  (1, 'HR/ Admin'),
  (1, 'Operations'),
  (1, 'Public Relations'),
  (1, 'IT Department'),
  (1, 'Account Department'),
  (1, 'Member Management');

-- Admin user
INSERT INTO employees (
  company_id, first_name, last_name, email, password_hash, role, department_id,
  job_title, salary, hire_date, date_of_birth, phone
) VALUES (
  1, 'Ama', 'Owusu',
  'admin@company.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW',
  'admin', 1, 'HR Director', 8500.00, '2020-01-15', '1985-03-22', '+233201234567'
);

-- Manager
INSERT INTO employees (
  company_id, first_name, last_name, email, password_hash, role, department_id,
  manager_id, job_title, salary, hire_date, date_of_birth
) VALUES (
  1, 'Kwame', 'Mensah',
  'kwame.mensah@company.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW',
  'manager', 4, 1, 'IT Manager', 7200.00, '2021-03-10', '1988-07-14'
);

-- Employees
INSERT INTO employees (
  company_id, first_name, last_name, email, password_hash, role, department_id,
  manager_id, job_title, salary, hire_date, date_of_birth
) VALUES
  (1, 'Akosua', 'Boateng', 'akosua.boateng@company.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW', 'employee', 4, 2, 'Senior Developer', 5500.00, '2022-06-01', '1993-11-30'),
  (1, 'Kofi', 'Asante', 'kofi.asante@company.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW', 'employee', 4, 2, 'Frontend Developer', 4800.00, '2023-01-15', '1996-05-18'),
  (1, 'Abena', 'Frimpong', 'abena.frimpong@company.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW', 'employee', 5, 1, 'Account Analyst', 4500.00, '2022-09-20', '1991-08-25'),
  (1, 'Yaw', 'Darko', 'yaw.darko@company.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBaoEf/r.Gl6iW', 'employee', 3, 1, 'Public Relations Lead', 4200.00, '2023-04-01', '1994-12-10');

UPDATE departments SET manager_id = 1 WHERE company_id = 1 AND name = 'HR/ Admin';
UPDATE departments SET manager_id = 2 WHERE company_id = 1 AND name = 'IT Department';
UPDATE departments SET manager_id = 6 WHERE company_id = 1 AND name = 'Public Relations';
UPDATE departments SET manager_id = 5 WHERE company_id = 1 AND name = 'Account Department';

INSERT INTO attendance (company_id, employee_id, work_date, clock_in, clock_out, status) VALUES
  (1, 1, CURRENT_DATE, NOW() - INTERVAL '7 hours', NULL, 'present'),
  (1, 2, CURRENT_DATE, NOW() - INTERVAL '7.5 hours', NULL, 'present'),
  (1, 3, CURRENT_DATE, NOW() - INTERVAL '6 hours', NULL, 'late'),
  (1, 4, CURRENT_DATE, NULL, NULL, 'absent'),
  (1, 5, CURRENT_DATE, NOW() - INTERVAL '8 hours', NULL, 'present'),
  (1, 1, CURRENT_DATE - 1, NOW() - INTERVAL '31 hours', NOW() - INTERVAL '23 hours', 'present'),
  (1, 2, CURRENT_DATE - 1, NOW() - INTERVAL '31.5 hours', NOW() - INTERVAL '23.5 hours', 'present'),
  (1, 3, CURRENT_DATE - 1, NOW() - INTERVAL '30 hours', NOW() - INTERVAL '22 hours', 'present');

INSERT INTO leave_requests (company_id, employee_id, leave_type, start_date, end_date, reason, status, approved_by, approved_at) VALUES
  (1, 3, 'annual', CURRENT_DATE + 7, CURRENT_DATE + 14, 'Family vacation', 'approved', 1, NOW()),
  (1, 4, 'sick', CURRENT_DATE - 2, CURRENT_DATE - 1, 'Fever', 'approved', 1, NOW() - INTERVAL '2 days'),
  (1, 5, 'annual', CURRENT_DATE + 30, CURRENT_DATE + 37, 'Holiday trip', 'pending', NULL, NULL);

INSERT INTO payroll (company_id, employee_id, month, year, base_salary, allowances, deductions, status) VALUES
  (1, 1, EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 8500, 500, 850, 'processed'),
  (1, 2, EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 7200, 400, 720, 'processed'),
  (1, 3, EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 5500, 300, 550, 'processed'),
  (1, 4, EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 4800, 200, 480, 'pending'),
  (1, 5, EXTRACT(MONTH FROM NOW())::INT, EXTRACT(YEAR FROM NOW())::INT, 4500, 200, 450, 'pending');

INSERT INTO notifications (company_id, employee_id, type, message, is_read) VALUES
  (1, 3, 'leave_approved', 'Your annual leave request has been approved.', false),
  (1, 4, 'leave_approved', 'Your sick leave has been approved.', true),
  (1, 1, 'birthday', 'Kofi Asante has a birthday coming up on May 18.', false),
  (1, 2, 'payroll', 'Your payroll for this month has been processed.', false);

INSERT INTO announcements (company_id, created_by, title, body, is_pinned) VALUES
  (1, 1, 'Welcome to HRConnect!', 'We are excited to launch our new HR Management system. Please update your profiles and explore all features.', true),
  (1, 1, 'Q2 Performance Reviews', 'Q2 performance reviews will begin next month. Managers, please prepare your review notes.', false);

INSERT INTO performance_reviews (company_id, employee_id, reviewer_id, rating, comments, review_date, period) VALUES
  (1, 3, 2, 5, 'Exceptional performance this quarter. Delivered the redesign project ahead of schedule.', CURRENT_DATE - 30, 'Q1 2025'),
  (1, 4, 2, 4, 'Strong frontend skills, good collaboration. Could improve documentation.', CURRENT_DATE - 30, 'Q1 2025'),
  (1, 5, 1, 4, 'Solid analytical skills, very reliable.', CURRENT_DATE - 30, 'Q1 2025');

INSERT INTO todos (
  company_id, title, detail, owner, owner_type, assigned_employee_id, due_date,
  priority, link, completed, completed_by, completed_at
) VALUES
  (1, 'Review leave requests', 'Approve or decline pending employee leave requests.', 'HR', 'hr', NULL, CURRENT_DATE + 1, 'High', '/pages/leave.html', false, NULL, NULL),
  (1, 'Finalize payroll amounts', 'Check pending salary records and process the current payroll cycle.', 'HR', 'hr', NULL, CURRENT_DATE + 2, 'High', '/pages/payroll.html', false, NULL, NULL),
  (1, 'Upload required documents', 'Add ID, certificates, contracts, or other missing employee documents.', 'Everyone', 'everyone', NULL, CURRENT_DATE + 4, 'Medium', '/pages/documents.html', false, NULL, NULL),
  (1, 'Track onboarding handoffs', 'Confirm equipment, access, buddy assignment, and first-week agenda.', 'Managers', 'managers', NULL, CURRENT_DATE + 5, 'Medium', '/pages/onboarding.html', true, 1, NOW() - INTERVAL '2 hours');

INSERT INTO it_tickets (
  company_id, ticket_number, employee_id, category, priority, subject,
  description, status, response, created_at, updated_at
) VALUES
  (1, 'IT-2026#A7K-4821', 3, 'access', 'high', 'Cannot access payroll page', 'The payroll page shows an access error when I try to open my payslip.', 'open', NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
  (1, 'IT-2026#B3Q-9174', 4, 'software', 'medium', 'Design software license expired', 'My design software says the license has expired and I cannot export files.', 'in_progress', 'IT is checking license availability.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours');
