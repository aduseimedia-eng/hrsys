(function () {
  const STORAGE_KEY = 'hr_mock_db_v2';
  const PASSWORD = 'Password123!';
  const MS_DAY = 86400000;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const today = () => new Date().toISOString().slice(0, 10);
  const dateOnly = (date) => new Date(date).toISOString().slice(0, 10);
  const addDays = (days) => dateOnly(Date.now() + days * MS_DAY);
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  const nextId = (items) => items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const monthNow = () => new Date().getMonth() + 1;
  const yearNow = () => new Date().getFullYear();

  function safeUser(employee) {
    const { password, password_hash, is_active, ...user } = employee;
    return clone(user);
  }

  function requireUser() {
    const user = JSON.parse(localStorage.getItem('hr_user') || 'null');
    if (!user) {
      const err = new Error('Please sign in again');
      err.status = 401;
      throw err;
    }
    return user;
  }

  function requireRole(user, roles) {
    if (!roles.includes(user.role)) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }
  }

  function parsePath(path) {
    return new URL(path, 'http://mock.local');
  }

  function seedDb() {
    const y = yearNow();
    const m = monthNow();
    const t = today();

    return {
      departments: [
        { id: 1, name: 'HR/ Admin', manager_id: 1, created_at: minutesAgo(20000) },
        { id: 2, name: 'Operations', manager_id: null, created_at: minutesAgo(20000) },
        { id: 3, name: 'Public Relations', manager_id: 6, created_at: minutesAgo(20000) },
        { id: 4, name: 'IT Department', manager_id: 2, created_at: minutesAgo(20000) },
        { id: 5, name: 'Account Department', manager_id: 5, created_at: minutesAgo(20000) },
        { id: 6, name: 'Member Management', manager_id: null, created_at: minutesAgo(20000) }
      ],
      employees: [
        {
          id: 1, first_name: 'Ama', last_name: 'Owusu', email: 'admin@company.com',
          password: PASSWORD, role: 'admin', employment_type: 'staff', department_id: 1, manager_id: null,
          job_title: 'HR Director', salary: 8500, hire_date: `${y - 6}-01-15`,
          phone: '+233201234567', address: 'Accra, Ghana', date_of_birth: '1985-03-22',
          education_information: 'MBA, Human Resource Management - University of Ghana',
          experience: '12 years in HR operations and people strategy',
          emergency_contact_name: 'Yaw Owusu', emergency_contact_relationship: 'Spouse',
          emergency_contact_phone: '+233209990001', emergency_contact_address: 'Accra, Ghana',
          bank_name: 'GCB Bank', bank_account_name: 'Ama Owusu', bank_account_number: '****4567', bank_branch: 'Osu',
          photo_url: null, is_active: true, created_at: minutesAgo(10000), updated_at: minutesAgo(10000)
        },
        {
          id: 2, first_name: 'Kwame', last_name: 'Mensah', email: 'kwame.mensah@company.com',
          password: PASSWORD, role: 'manager', employment_type: 'staff', department_id: 4, manager_id: 1,
          job_title: 'IT Manager', salary: 7200, hire_date: `${y - 5}-03-10`,
          phone: '+233201112222', address: 'Accra, Ghana', date_of_birth: '1988-07-14',
          education_information: 'BSc Computer Engineering - KNUST',
          experience: '9 years building and leading software teams',
          emergency_contact_name: 'Nana Mensah', emergency_contact_relationship: 'Sibling',
          emergency_contact_phone: '+233209990002', emergency_contact_address: 'Accra, Ghana',
          bank_name: 'Ecobank', bank_account_name: 'Kwame Mensah', bank_account_number: '****2222', bank_branch: 'Airport',
          photo_url: null, is_active: true, created_at: minutesAgo(9000), updated_at: minutesAgo(9000)
        },
        {
          id: 3, first_name: 'Akosua', last_name: 'Boateng', email: 'akosua.boateng@company.com',
          password: PASSWORD, role: 'employee', employment_type: 'staff', department_id: 4, manager_id: 2,
          job_title: 'Senior Developer', salary: 5500, hire_date: `${y - 4}-06-01`,
          phone: '+233244445555', address: 'Tema, Ghana', date_of_birth: '1993-11-30',
          education_information: 'BSc Information Technology - University of Ghana',
          experience: '6 years in frontend and product engineering',
          emergency_contact_name: 'Kojo Boateng', emergency_contact_relationship: 'Father',
          emergency_contact_phone: '+233209990003', emergency_contact_address: 'Tema, Ghana',
          bank_name: 'Absa Bank', bank_account_name: 'Akosua Boateng', bank_account_number: '****5555', bank_branch: 'Tema Community 1',
          photo_url: null, is_active: true, created_at: minutesAgo(8000), updated_at: minutesAgo(8000)
        },
        {
          id: 4, first_name: 'Kofi', last_name: 'Asante', email: 'kofi.asante@company.com',
          password: PASSWORD, role: 'employee', employment_type: 'contractual', department_id: 4, manager_id: 2,
          job_title: 'Frontend Developer', salary: 4800, hire_date: `${y - 3}-01-15`,
          phone: '+233255556666', address: 'Kumasi, Ghana', date_of_birth: '1996-05-18',
          education_information: 'Diploma in Software Development - IPMC',
          experience: '4 years in web application development',
          emergency_contact_name: 'Afia Asante', emergency_contact_relationship: 'Mother',
          emergency_contact_phone: '+233209990004', emergency_contact_address: 'Kumasi, Ghana',
          bank_name: 'Stanbic Bank', bank_account_name: 'Kofi Asante', bank_account_number: '****6666', bank_branch: 'Adum',
          photo_url: null, is_active: true, created_at: minutesAgo(7000), updated_at: minutesAgo(7000)
        },
        {
          id: 5, first_name: 'Abena', last_name: 'Frimpong', email: 'abena.frimpong@company.com',
          password: PASSWORD, role: 'employee', employment_type: 'national_service', department_id: 5, manager_id: 1,
          job_title: 'Account Analyst', salary: 4500, hire_date: `${y - 4}-09-20`,
          phone: '+233266667777', address: 'Cape Coast, Ghana', date_of_birth: '1991-08-25',
          education_information: 'BSc Accounting - University of Cape Coast',
          experience: '7 years in finance operations and reporting',
          emergency_contact_name: 'Esi Frimpong', emergency_contact_relationship: 'Sister',
          emergency_contact_phone: '+233209990005', emergency_contact_address: 'Cape Coast, Ghana',
          bank_name: 'CalBank', bank_account_name: 'Abena Frimpong', bank_account_number: '****7777', bank_branch: 'Cape Coast',
          photo_url: null, is_active: true, created_at: minutesAgo(6000), updated_at: minutesAgo(6000)
        },
        {
          id: 6, first_name: 'Yaw', last_name: 'Darko', email: 'yaw.darko@company.com',
          password: PASSWORD, role: 'employee', employment_type: 'internship', department_id: 3, manager_id: 1,
          job_title: 'Public Relations Lead', salary: 4200, hire_date: `${y - 3}-04-01`,
          phone: '+233277778888', address: 'Takoradi, Ghana', date_of_birth: '1994-12-10',
          education_information: 'BA Marketing - University of Professional Studies',
          experience: '5 years in campaign planning and brand growth',
          emergency_contact_name: 'Efua Darko', emergency_contact_relationship: 'Spouse',
          emergency_contact_phone: '+233209990006', emergency_contact_address: 'Takoradi, Ghana',
          bank_name: 'Fidelity Bank', bank_account_name: 'Yaw Darko', bank_account_number: '****8888', bank_branch: 'Takoradi',
          photo_url: null, is_active: true, created_at: minutesAgo(5000), updated_at: minutesAgo(5000)
        }
      ],
      attendance: [
        { id: 1, employee_id: 1, work_date: t, clock_in: minutesAgo(430), clock_out: null, status: 'present', notes: null },
        { id: 2, employee_id: 2, work_date: t, clock_in: minutesAgo(450), clock_out: null, status: 'present', notes: null },
        { id: 3, employee_id: 3, work_date: t, clock_in: minutesAgo(360), clock_out: null, status: 'present', notes: null },
        { id: 4, employee_id: 4, work_date: t, clock_in: null, clock_out: null, status: 'absent', notes: null },
        { id: 5, employee_id: 5, work_date: t, clock_in: minutesAgo(470), clock_out: null, status: 'present', notes: null },
        { id: 6, employee_id: 3, work_date: addDays(-1), clock_in: minutesAgo(1900), clock_out: minutesAgo(1420), status: 'present', notes: null },
        { id: 7, employee_id: 3, work_date: addDays(-2), clock_in: minutesAgo(3340), clock_out: minutesAgo(2860), status: 'present', notes: null }
      ],
      leave_requests: [
        {
          id: 1, employee_id: 3, approved_by: 1, leave_type: 'annual',
          start_date: addDays(7), end_date: addDays(14), reason: 'Family vacation',
          status: 'approved', approved_at: minutesAgo(4000), created_at: minutesAgo(5000)
        },
        {
          id: 2, employee_id: 4, approved_by: 1, leave_type: 'sick',
          start_date: addDays(-2), end_date: addDays(-1), reason: 'Fever',
          status: 'approved', approved_at: minutesAgo(2000), created_at: minutesAgo(2600)
        },
        {
          id: 3, employee_id: 5, approved_by: null, leave_type: 'annual',
          start_date: addDays(30), end_date: addDays(37), reason: 'Holiday trip',
          status: 'pending', approved_at: null, created_at: minutesAgo(800)
        }
      ],
      payroll: [
        { id: 1, employee_id: 1, month: m, year: y, base_salary: 8500, allowances: 500, deductions: 850, status: 'processed', paid_at: null, created_at: minutesAgo(2000) },
        { id: 2, employee_id: 2, month: m, year: y, base_salary: 7200, allowances: 400, deductions: 720, status: 'processed', paid_at: null, created_at: minutesAgo(2000) },
        { id: 3, employee_id: 3, month: m, year: y, base_salary: 5500, allowances: 300, deductions: 550, status: 'processed', paid_at: null, created_at: minutesAgo(2000) },
        { id: 4, employee_id: 4, month: m, year: y, base_salary: 4800, allowances: 200, deductions: 480, status: 'pending', paid_at: null, created_at: minutesAgo(2000) },
        { id: 5, employee_id: 5, month: m, year: y, base_salary: 4500, allowances: 200, deductions: 450, status: 'pending', paid_at: null, created_at: minutesAgo(2000) }
      ],
      documents: [],
      performance_reviews: [
        { id: 1, employee_id: 3, reviewer_id: 2, rating: 5, comments: 'Exceptional performance this quarter. Delivered the redesign project ahead of schedule.', review_date: addDays(-30), period: 'Q1 2026', created_at: minutesAgo(3000) },
        { id: 2, employee_id: 4, reviewer_id: 2, rating: 4, comments: 'Strong frontend skills and good collaboration. Documentation can improve.', review_date: addDays(-30), period: 'Q1 2026', created_at: minutesAgo(2900) },
        { id: 3, employee_id: 5, reviewer_id: 1, rating: 4, comments: 'Solid analytical skills and very reliable.', review_date: addDays(-30), period: 'Q1 2026', created_at: minutesAgo(2800) }
      ],
      notifications: [
        { id: 1, employee_id: 3, type: 'leave_approved', message: 'Your annual leave request has been approved.', link: null, is_read: false, created_at: minutesAgo(700) },
        { id: 2, employee_id: 4, type: 'leave_approved', message: 'Your sick leave has been approved.', link: null, is_read: true, created_at: minutesAgo(1700) },
        { id: 3, employee_id: 1, type: 'birthday', message: 'Kofi Asante has a birthday coming up on May 18.', link: null, is_read: false, created_at: minutesAgo(600) },
        { id: 4, employee_id: 2, type: 'payroll', message: 'Your payroll for this month has been processed.', link: null, is_read: false, created_at: minutesAgo(400) }
      ],
      announcements: [
        { id: 1, created_by: 1, title: 'Welcome to KenadHR', body: 'We are excited to launch our HR management workspace. Please update your profile and explore the modules.', is_pinned: true, created_at: minutesAgo(9000) },
        { id: 2, created_by: 1, title: 'Q2 Performance Reviews', body: 'Q2 performance reviews will begin next month. Managers, please prepare review notes.', is_pinned: false, created_at: minutesAgo(7000) }
      ],
      messages: [
        { id: 1, sender_id: 2, receiver_id: 3, body: 'Nice work on the dashboard polish.', is_read: false, sent_at: minutesAgo(120) },
        { id: 2, sender_id: 3, receiver_id: 2, body: 'Thank you. I will ship the next pass today.', is_read: true, sent_at: minutesAgo(90) }
      ],
      team_messages: [
        { id: 1, sender_id: 1, body: 'Welcome to Team Chat. Use this space for quick updates and collaboration.', sent_at: minutesAgo(180) }
      ],
      todos: [
        {
          id: 1,
          title: 'Review leave requests',
          detail: 'Approve or decline pending employee leave requests.',
          owner: 'HR',
          owner_type: 'hr',
          assigned_employee_id: null,
          due_date: addDays(1),
          priority: 'High',
          link: '/pages/leave.html',
          completed: false,
          completed_by: null,
          completed_at: null,
          created_at: minutesAgo(500)
        },
        {
          id: 2,
          title: 'Finalize payroll amounts',
          detail: 'Check pending salary records and process the current payroll cycle.',
          owner: 'HR',
          owner_type: 'hr',
          assigned_employee_id: null,
          due_date: addDays(2),
          priority: 'High',
          link: '/pages/payroll.html',
          completed: false,
          completed_by: null,
          completed_at: null,
          created_at: minutesAgo(480)
        },
        {
          id: 3,
          title: 'Upload required documents',
          detail: 'Add ID, certificates, contracts, or other missing employee documents.',
          owner: 'Everyone',
          owner_type: 'everyone',
          assigned_employee_id: null,
          due_date: addDays(4),
          priority: 'Medium',
          link: '/pages/documents.html',
          completed: false,
          completed_by: null,
          completed_at: null,
          created_at: minutesAgo(460)
        },
        {
          id: 4,
          title: 'Track onboarding handoffs',
          detail: 'Confirm equipment, access, buddy assignment, and first-week agenda.',
          owner: 'Managers',
          owner_type: 'managers',
          assigned_employee_id: null,
          due_date: addDays(5),
          priority: 'Medium',
          link: '/pages/onboarding.html',
          completed: true,
          completed_by: 1,
          completed_at: minutesAgo(120),
          created_at: minutesAgo(440)
        }
      ],
      it_tickets: [
        {
          id: 1,
          ticket_number: 'IT-2026#A7K-4821',
          employee_id: 3,
          category: 'access',
          priority: 'high',
          subject: 'Cannot access payroll page',
          description: 'The payroll page shows an access error when I try to open my payslip.',
          status: 'open',
          response: '',
          created_at: minutesAgo(180),
          updated_at: minutesAgo(180),
          resolved_at: null
        },
        {
          id: 2,
          ticket_number: 'IT-2026#B3Q-9174',
          employee_id: 4,
          category: 'software',
          priority: 'medium',
          subject: 'Design software license expired',
          description: 'My design software says the license has expired and I cannot export files.',
          status: 'in_progress',
          response: 'IT is checking license availability.',
          created_at: minutesAgo(1440),
          updated_at: minutesAgo(240),
          resolved_at: null
        }
      ]
    };
  }

  function loadDb() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (!Array.isArray(db.team_messages)) db.team_messages = seedDb().team_messages;
      const departmentNames = (db.departments || []).map((dept) => dept.name).join('|');
      if (!departmentNames.includes('HR/ Admin') || !departmentNames.includes('Member Management')) {
        const oldDepartmentById = Object.fromEntries((db.departments || []).map((dept) => [dept.id, dept.name]));
        const oldToNewDepartment = {
          'Human Resources': 1,
          'Engineering': 4,
          'Finance': 5,
          'Marketing': 3,
          'Operations': 2
        };
        db.employees?.forEach((emp) => {
          const oldName = oldDepartmentById[emp.department_id];
          if (oldToNewDepartment[oldName]) emp.department_id = oldToNewDepartment[oldName];
        });
        db.departments = [
          { id: 1, name: 'HR/ Admin', manager_id: 1, created_at: minutesAgo(20000) },
          { id: 2, name: 'Operations', manager_id: null, created_at: minutesAgo(20000) },
          { id: 3, name: 'Public Relations', manager_id: 6, created_at: minutesAgo(20000) },
          { id: 4, name: 'IT Department', manager_id: 2, created_at: minutesAgo(20000) },
          { id: 5, name: 'Account Department', manager_id: 5, created_at: minutesAgo(20000) },
          { id: 6, name: 'Member Management', manager_id: null, created_at: minutesAgo(20000) }
        ];
        saveDb(db);
      }
      if (!Array.isArray(db.todos)) {
        db.todos = seedDb().todos;
        saveDb(db);
      } else if (db.todos.some((todo) => !todo.owner_type)) {
        db.todos.forEach((todo) => {
          todo.owner_type ||= todo.owner === 'HR' ? 'hr' : todo.owner === 'Managers' ? 'managers' : 'everyone';
          todo.assigned_employee_id ||= null;
        });
        saveDb(db);
      }
      if (!Array.isArray(db.it_tickets)) {
        db.it_tickets = seedDb().it_tickets;
        saveDb(db);
      }
      db.it_tickets.forEach((ticket) => {
        ticket.ticket_number ||= generateTicketNumber(db);
      });
      db.employees.forEach((emp) => {
        emp.education_information ||= '';
        emp.education_level ||= emp.education_information ? emp.education_information.split(' - ')[0] : '';
        emp.education_institution ||= emp.education_information && emp.education_information.includes(' - ') ? emp.education_information.split(' - ').slice(1).join(' - ') : '';
        emp.education_field ||= '';
        emp.graduation_year ||= '';
        emp.experience ||= '';
        emp.previous_company ||= '';
        emp.previous_job_title ||= emp.job_title || '';
        emp.experience_years ||= emp.experience ? emp.experience.split(' ')[0] : '';
        emp.experience_summary ||= emp.experience;
        emp.emergency_contact_name ||= '';
        emp.emergency_contact_relationship ||= '';
        emp.emergency_contact_phone ||= '';
        emp.emergency_contact_address ||= '';
        emp.bank_name ||= '';
        emp.bank_account_name ||= `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        emp.bank_account_number ||= '';
        emp.bank_branch ||= '';
      });
      saveDb(db);
      return db;
    }
    const db = seedDb();
    db.it_tickets.forEach((ticket) => {
      ticket.ticket_number ||= generateTicketNumber(db);
    });
    db.employees.forEach((emp) => {
      emp.education_level ||= emp.education_information ? emp.education_information.split(' - ')[0] : '';
      emp.education_institution ||= emp.education_information && emp.education_information.includes(' - ') ? emp.education_information.split(' - ').slice(1).join(' - ') : '';
      emp.education_field ||= '';
      emp.graduation_year ||= '';
      emp.previous_company ||= '';
      emp.previous_job_title ||= emp.job_title || '';
      emp.experience_years ||= emp.experience ? emp.experience.split(' ')[0] : '';
      emp.experience_summary ||= emp.experience || '';
    });
    saveDb(db);
    return db;
  }

  function saveDb(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function employeeName(db, id) {
    const emp = db.employees.find((e) => e.id === Number(id));
    return emp ? `${emp.first_name} ${emp.last_name}` : '';
  }

  function departmentName(db, id) {
    const dept = db.departments.find((d) => d.id === Number(id));
    return dept ? dept.name : null;
  }

  function leaveDays(startDate, endDate) {
    return Math.ceil((new Date(endDate) - new Date(startDate)) / MS_DAY) + 1;
  }

  function enrichEmployee(db, emp) {
    return {
      ...clone(emp),
      password: undefined,
      password_hash: undefined,
      department_name: departmentName(db, emp.department_id),
      manager_name: emp.manager_id ? employeeName(db, emp.manager_id) : null
    };
  }

  function enrichPayroll(db, row) {
    const emp = db.employees.find((e) => e.id === row.employee_id) || {};
    const net = Number(row.base_salary || 0) + Number(row.allowances || 0) - Number(row.deductions || 0);
    return {
      ...clone(row),
      net_salary: net,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      employee_name: emp.id ? `${emp.first_name} ${emp.last_name}` : '',
      job_title: emp.job_title,
      photo_url: emp.photo_url,
      role: emp.role,
      employment_type: emp.employment_type || 'staff',
      department_name: departmentName(db, emp.department_id)
    };
  }

  function daysUntilBirthday(dateOfBirth) {
    if (!dateOfBirth) return Infinity;
    const now = new Date();
    const dob = new Date(dateOfBirth);
    let next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (dateOnly(next) < today()) next = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
    return Math.ceil((next - new Date(today())) / MS_DAY);
  }

  function between(date, start, end) {
    return date >= start && date <= end;
  }

  function filterEmployees(db, url) {
    const params = url.searchParams;
    let rows = db.employees.filter((e) => e.is_active);
    const departmentId = params.get('department_id');
    const role = params.get('role');
    const employmentType = params.get('employment_type');
    const search = (params.get('search') || '').toLowerCase();
    if (departmentId) rows = rows.filter((e) => e.department_id === Number(departmentId));
    if (role) rows = rows.filter((e) => e.role === role);
    if (employmentType) rows = rows.filter((e) => e.employment_type === employmentType);
    if (search) {
      rows = rows.filter((e) => `${e.first_name} ${e.last_name} ${e.email}`.toLowerCase().includes(search));
    }
    const total = rows.length;
    const page = Number(params.get('page') || 1);
    const limit = Number(params.get('limit') || 20);
    const start = (page - 1) * limit;
    rows = rows.slice(start, start + limit).map((e) => enrichEmployee(db, e));
    return { employees: rows, total, page, limit };
  }

  function dashboard(db) {
    const t = today();
    const m = monthNow();
    const y = yearNow();
    const payroll = db.payroll
      .filter((p) => p.month === m && p.year === y && ['processed', 'paid'].includes(p.status))
      .reduce((sum, p) => sum + Number(enrichPayroll(db, p).net_salary || 0), 0);

    return {
      total_employees: db.employees.filter((e) => e.is_active).length,
      present_today: db.attendance.filter((a) => a.work_date === t && a.status === 'present').length,
      on_leave_today: db.leave_requests.filter((l) => l.status === 'approved' && between(t, l.start_date, l.end_date)).length,
      payroll_this_month: payroll,
      upcoming_birthdays: db.employees
        .filter((e) => e.is_active && daysUntilBirthday(e.date_of_birth) <= 30)
        .sort((a, b) => daysUntilBirthday(a.date_of_birth) - daysUntilBirthday(b.date_of_birth))
        .slice(0, 5)
        .map((e) => safeUser(e)),
      recent_hires: db.employees
        .filter((e) => e.is_active)
        .sort((a, b) => String(b.hire_date).localeCompare(String(a.hire_date)))
        .slice(0, 5)
        .map((e) => safeUser(e))
    };
  }

  function departments(db) {
    return db.departments
      .map((d) => ({
        ...clone(d),
        manager_name: d.manager_id ? employeeName(db, d.manager_id) : null,
        employee_count: db.employees.filter((e) => e.is_active && e.department_id === d.id).length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function attendanceReport(db, url) {
    const params = url.searchParams;
    let rows = db.attendance.slice();
    const date = params.get('date');
    const status = params.get('status');
    const departmentId = params.get('department_id');
    if (date) rows = rows.filter((a) => a.work_date === date);
    if (status) rows = rows.filter((a) => a.status === status);
    if (departmentId) {
      rows = rows.filter((a) => {
        const emp = db.employees.find((e) => e.id === a.employee_id);
        return emp && emp.department_id === Number(departmentId);
      });
    }
    return rows
      .map((a) => {
        const emp = db.employees.find((e) => e.id === a.employee_id) || {};
        return {
          ...clone(a),
          employee_name: emp.id ? `${emp.first_name} ${emp.last_name}` : '',
          job_title: emp.job_title,
          department_name: departmentName(db, emp.department_id)
        };
      })
      .sort((a, b) => `${b.work_date}${a.employee_name}`.localeCompare(`${a.work_date}${b.employee_name}`));
  }

  function leaveRows(db, rows) {
    const annualEntitlement = 20;
    const currentYear = new Date().getFullYear();
    return rows.map((r) => {
      const emp = db.employees.find((e) => e.id === r.employee_id) || {};
      const annualRows = db.leave_requests.filter((leave) => (
        leave.employee_id === r.employee_id &&
        leave.leave_type === 'annual' &&
        new Date(leave.start_date).getFullYear() === currentYear
      ));
      const annualUsedDays = annualRows
        .filter((leave) => leave.status === 'approved')
        .reduce((sum, leave) => sum + leaveDays(leave.start_date, leave.end_date), 0);
      const annualPendingDays = annualRows
        .filter((leave) => leave.status === 'pending')
        .reduce((sum, leave) => sum + leaveDays(leave.start_date, leave.end_date), 0);
      return {
        ...clone(r),
        employee_name: emp.id ? `${emp.first_name} ${emp.last_name}` : '',
        photo_url: emp.photo_url,
        department_name: departmentName(db, emp.department_id),
        approver_name: r.approved_by ? employeeName(db, r.approved_by) : null,
        annual_entitlement: annualEntitlement,
        annual_used_days: annualUsedDays,
        annual_pending_days: annualPendingDays,
        annual_remaining_days: Math.max(0, annualEntitlement - annualUsedDays)
      };
    });
  }

  function enrichTodo(db, todo) {
    const assigned = todo.assigned_employee_id
      ? db.employees.find((e) => e.id === Number(todo.assigned_employee_id))
      : null;
    const owner = assigned ? `${assigned.first_name} ${assigned.last_name}` : todo.owner;
    return {
      ...clone(todo),
      owner,
      assigned_employee_name: assigned ? `${assigned.first_name} ${assigned.last_name}` : null,
      completed_by_name: todo.completed_by ? employeeName(db, todo.completed_by) : null
    };
  }

  function todoVisibleToUser(todo, user) {
    if (todo.owner_type === 'everyone') return true;
    if (todo.owner_type === 'hr') return ['admin', 'manager'].includes(user.role);
    if (todo.owner_type === 'managers') return ['admin', 'manager'].includes(user.role);
    if (todo.owner_type === 'employee') return Number(todo.assigned_employee_id) === Number(user.id);
    return true;
  }

  function todoRows(db, url) {
    const status = url.searchParams.get('status') || 'open';
    const scope = url.searchParams.get('scope') || 'all';
    let rows = db.todos || [];
    if (scope === 'mine') rows = rows.filter((todo) => todoVisibleToUser(todo, requireUser()));
    if (status === 'open') rows = rows.filter((todo) => !todo.completed);
    if (status === 'completed' || status === 'history') rows = rows.filter((todo) => todo.completed);
    return rows
      .map((todo) => enrichTodo(db, todo))
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        if (a.completed) return String(b.completed_at || '').localeCompare(String(a.completed_at || ''));
        return String(a.due_date || '').localeCompare(String(b.due_date || ''));
      });
  }

  function enrichTicket(db, ticket) {
    const emp = db.employees.find((e) => e.id === Number(ticket.employee_id)) || {};
    return {
      ...clone(ticket),
      employee_name: emp.id ? `${emp.first_name} ${emp.last_name}` : '',
      email: emp.email,
      job_title: emp.job_title
    };
  }

  function itDepartmentRecipients(db) {
    const itDepartment = db.departments.find((d) => d.name === 'IT Department');
    return db.employees.filter((e) => (
      e.is_active &&
      (e.department_id === itDepartment?.id || e.id === itDepartment?.manager_id)
    ));
  }

  function isItDepartmentUser(db, user) {
    const itDepartment = db.departments.find((d) => d.name === 'IT Department');
    return Boolean(
      user &&
      (user.department_id === itDepartment?.id || user.id === itDepartment?.manager_id)
    );
  }

  function isItDepartmentMember(db, user) {
    const itDepartment = db.departments.find((d) => d.name === 'IT Department');
    return Boolean(
      user &&
      (user.department_id === itDepartment?.id || user.id === itDepartment?.manager_id)
    );
  }

  function generateTicketNumber(db) {
    let value = '';
    do {
      const year = new Date().getFullYear();
      const letters = Math.random().toString(36).slice(2, 5).toUpperCase();
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      value = `IT-${year}#${letters}-${digits}`;
    } while (db.it_tickets.some((ticket) => ticket.ticket_number === value));
    return value;
  }

  function orgTree(db) {
    const map = {};
    const roots = [];
    db.employees.filter((e) => e.is_active).forEach((e) => {
      map[e.id] = {
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        job_title: e.job_title,
        photo_url: e.photo_url,
        manager_id: e.manager_id,
        department_id: e.department_id,
        department_name: departmentName(db, e.department_id),
        role: e.role,
        children: []
      };
    });
    Object.values(map).forEach((node) => {
      if (node.manager_id && map[node.manager_id]) map[node.manager_id].children.push(node);
      else roots.push(node);
    });
    return roots;
  }

  function avg(values) {
    if (!values.length) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  async function fileToDataUrl(file) {
    if (!file || typeof FileReader === 'undefined') return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function handle(method, path, body) {
    const url = parsePath(path);
    const route = url.pathname;
    const db = loadDb();
    const isAdminLogin = method === 'POST' && route === '/auth/login';
    const isStaffLogin = method === 'POST' && route === '/auth/staff-login';
    const isLogin = isAdminLogin || isStaffLogin;
    const user = isLogin ? null : requireUser();

    if (isLogin) {
      const email = String(body?.email || '').toLowerCase().trim();
      const employee = db.employees.find((e) => e.email.toLowerCase() === email && e.is_active);
      if (!employee || employee.password !== body?.password) throw new Error('Invalid credentials');
      if (isAdminLogin && !['admin', 'manager'].includes(employee.role)) throw new Error('Only HR/Admin or manager accounts can access this workspace');
      if (isStaffLogin && employee.role === 'admin') throw new Error('Please use the HR/Admin sign in page for this account');
      return { token: `mock-token-${employee.id}-${Date.now()}`, user: safeUser(employee) };
    }

    if (method === 'GET' && route === '/auth/me') {
      const emp = db.employees.find((e) => e.id === user.id);
      return enrichEmployee(db, emp);
    }

    if (method === 'PUT' && route === '/auth/password') {
      const emp = db.employees.find((e) => e.id === user.id);
      if (emp.password !== body?.current_password) throw new Error('Current password is incorrect');
      if (!body?.new_password || body.new_password.length < 8) throw new Error('New password must be at least 8 characters');
      emp.password = body.new_password;
      saveDb(db);
      return { message: 'Password updated successfully' };
    }

    if (method === 'PATCH' && route === '/auth/email') {
      const emp = db.employees.find((e) => e.id === user.id);
      const email = String(body?.email || '').toLowerCase().trim();
      if (!email) throw new Error('Email is required');
      if (db.employees.some((e) => e.id !== user.id && e.email.toLowerCase() === email)) throw new Error('Email already registered');
      emp.email = email;
      saveDb(db);
      localStorage.setItem('hr_user', JSON.stringify(safeUser(emp)));
      return safeUser(emp);
    }

    if (method === 'GET' && route === '/employees/dashboard') {
      requireRole(user, ['admin', 'manager']);
      return dashboard(db);
    }

    if (method === 'GET' && route === '/employees/departments') return departments(db);

    if (method === 'POST' && route === '/employees/departments') {
      requireRole(user, ['admin']);
      const name = String(body?.name || '').trim();
      if (!name) throw new Error('Department name is required');
      if (db.departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Department already exists');
      }
      const row = {
        id: nextId(db.departments),
        name,
        manager_id: body?.manager_id ? Number(body.manager_id) : null,
        created_at: new Date().toISOString()
      };
      db.departments.push(row);
      saveDb(db);
      return departments(db).find((d) => d.id === row.id);
    }

    const departmentDeleteMatch = route.match(/^\/employees\/departments\/(\d+)$/);
    if (departmentDeleteMatch && method === 'DELETE') {
      requireRole(user, ['admin']);
      const id = Number(departmentDeleteMatch[1]);
      const index = db.departments.findIndex((d) => d.id === id);
      if (index < 0) throw new Error('Department not found');
      const [removed] = db.departments.splice(index, 1);
      db.employees.forEach((emp) => {
        if (Number(emp.department_id) === id) emp.department_id = null;
      });
      saveDb(db);
      return { message: 'Department deleted', department: removed };
    }

    if (method === 'GET' && route === '/employees/directory') {
      return db.employees
        .filter((e) => e.is_active)
        .map((e) => ({
          id: e.id,
          first_name: e.first_name,
          last_name: e.last_name,
          photo_url: e.photo_url,
          job_title: e.job_title,
          role: e.role,
          employment_type: e.employment_type,
          department_id: e.department_id
        }))
        .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    }

    if (method === 'GET' && route === '/employees') {
      requireRole(user, ['admin', 'manager']);
      const data = filterEmployees(db, url);
      if (user.role !== 'admin') data.employees.forEach((e) => delete e.salary);
      return data;
    }

    if (method === 'POST' && route === '/employees') {
      requireRole(user, ['admin']);
      if (!body?.first_name || !body?.last_name || !body?.email || !body?.password) {
        throw new Error('Name, email and password are required');
      }
      if (db.employees.some((e) => e.email.toLowerCase() === body.email.toLowerCase())) {
        throw new Error('Email already registered');
      }
      const employee = {
        id: nextId(db.employees),
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email.toLowerCase(),
        password: body.password,
        role: body.role || 'employee',
        employment_type: body.employment_type || 'staff',
        department_id: body.department_id ? Number(body.department_id) : null,
        manager_id: body.manager_id ? Number(body.manager_id) : null,
        job_title: body.job_title || '',
        salary: Number(body.salary || 0),
        hire_date: body.hire_date || null,
        phone: body.phone || '',
        address: body.address || '',
        date_of_birth: body.date_of_birth || null,
        education_information: body.education_information || '',
        education_level: body.education_level || '',
        education_institution: body.education_institution || '',
        education_field: body.education_field || '',
        graduation_year: body.graduation_year || '',
        experience: body.experience || '',
        previous_company: body.previous_company || '',
        previous_job_title: body.previous_job_title || '',
        experience_years: body.experience_years || '',
        experience_summary: body.experience_summary || '',
        emergency_contact_name: body.emergency_contact_name || '',
        emergency_contact_relationship: body.emergency_contact_relationship || '',
        emergency_contact_phone: body.emergency_contact_phone || '',
        emergency_contact_address: body.emergency_contact_address || '',
        bank_name: body.bank_name || '',
        bank_account_name: body.bank_account_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
        bank_account_number: body.bank_account_number || '',
        bank_branch: body.bank_branch || '',
        photo_url: null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.employees.push(employee);
      db.notifications.push({
        id: nextId(db.notifications),
        employee_id: employee.id,
        type: 'welcome',
        message: `Welcome to the team, ${employee.first_name}. Your account has been created.`,
        link: null,
        is_read: false,
        created_at: new Date().toISOString()
      });
      saveDb(db);
      return safeUser(employee);
    }

    const employeeMatch = route.match(/^\/employees\/(\d+)$/);
    if (employeeMatch && method === 'GET') {
      const id = Number(employeeMatch[1]);
      if (user.role === 'employee' && user.id !== id) throw new Error('Access denied');
      const emp = db.employees.find((e) => e.id === id);
      if (!emp) throw new Error('Employee not found');
      const result = enrichEmployee(db, emp);
      if (user.role !== 'admin' && user.id !== id) delete result.salary;
      return result;
    }

    if (employeeMatch && method === 'PUT') {
      const id = Number(employeeMatch[1]);
      const emp = db.employees.find((e) => e.id === id);
      if (!emp) throw new Error('Employee not found');
      if (user.role !== 'admin' && user.id !== id) throw new Error('Access denied');
      const allowed = user.role === 'admin'
        ? ['first_name', 'last_name', 'phone', 'address', 'date_of_birth', 'department_id', 'manager_id', 'job_title', 'salary', 'role', 'employment_type', 'hire_date', 'education_information', 'education_level', 'education_institution', 'education_field', 'graduation_year', 'experience', 'previous_company', 'previous_job_title', 'experience_years', 'experience_summary', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'emergency_contact_address', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch']
        : ['first_name', 'last_name', 'phone', 'address', 'date_of_birth', 'education_information', 'education_level', 'education_institution', 'education_field', 'graduation_year', 'experience', 'previous_company', 'previous_job_title', 'experience_years', 'experience_summary', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'emergency_contact_address', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch'];
      allowed.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(body, field)) return;
        const numeric = ['department_id', 'manager_id', 'salary'].includes(field);
        emp[field] = body[field] === '' || body[field] == null ? null : numeric ? Number(body[field]) : body[field];
      });
      emp.updated_at = new Date().toISOString();
      saveDb(db);
      return safeUser(emp);
    }

    const accountResetMatch = route.match(/^\/employees\/(\d+)\/account$/);
    if (accountResetMatch && method === 'PATCH') {
      requireRole(user, ['admin']);
      const id = Number(accountResetMatch[1]);
      const emp = db.employees.find((e) => e.id === id);
      if (!emp) throw new Error('Employee not found');
      if (body?.email) {
        const email = String(body.email).toLowerCase().trim();
        if (db.employees.some((e) => e.id !== id && e.email.toLowerCase() === email)) throw new Error('Email already registered');
        emp.email = email;
      }
      if (body?.password) {
        if (String(body.password).length < 8) throw new Error('Password must be at least 8 characters');
        emp.password = String(body.password);
      }
      saveDb(db);
      return safeUser(emp);
    }

    const deactivateMatch = route.match(/^\/employees\/(\d+)\/deactivate$/);
    if (deactivateMatch && method === 'PATCH') {
      requireRole(user, ['admin']);
      const id = Number(deactivateMatch[1]);
      if (id === user.id) throw new Error('Cannot deactivate yourself');
      const emp = db.employees.find((e) => e.id === id);
      if (!emp) throw new Error('Employee not found');
      emp.is_active = false;
      saveDb(db);
      return { message: 'Employee deactivated' };
    }

    if (method === 'POST' && route === '/employees/me/photo') {
      const file = body?.get ? body.get('photo') : null;
      const dataUrl = await fileToDataUrl(file);
      const emp = db.employees.find((e) => e.id === user.id);
      emp.photo_url = dataUrl;
      saveDb(db);
      localStorage.setItem('hr_user', JSON.stringify(safeUser(emp)));
      return { photo_url: dataUrl };
    }

    if (method === 'GET' && route === '/attendance/today') {
      return clone(db.attendance.find((a) => a.employee_id === user.id && a.work_date === today()) || { clocked_in: false });
    }

    if (method === 'POST' && route === '/attendance/clock-in') {
      const existing = db.attendance.find((a) => a.employee_id === user.id && a.work_date === today());
      if (existing?.clock_in) throw new Error('Already clocked in today');
      const now = new Date();
      const status = 'present';
      const row = existing || { id: nextId(db.attendance), employee_id: user.id, work_date: today(), clock_out: null, notes: null };
      row.clock_in = now.toISOString();
      row.status = status;
      if (!existing) db.attendance.push(row);
      saveDb(db);
      return clone(row);
    }

    if (method === 'POST' && route === '/attendance/clock-out') {
      const row = db.attendance.find((a) => a.employee_id === user.id && a.work_date === today());
      if (!row?.clock_in) throw new Error('You have not clocked in today');
      if (row.clock_out) throw new Error('Already clocked out today');
      row.clock_out = new Date().toISOString();
      saveDb(db);
      return clone(row);
    }

    if (method === 'GET' && route === '/attendance/my-history') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      return db.attendance
        .filter((a) => a.employee_id === user.id)
        .filter((a) => !from || a.work_date >= from)
        .filter((a) => !to || a.work_date <= to)
        .sort((a, b) => b.work_date.localeCompare(a.work_date))
        .map(clone);
    }

    if (method === 'GET' && route === '/attendance/report') {
      requireRole(user, ['admin', 'manager']);
      return attendanceReport(db, url);
    }

    if (method === 'GET' && route === '/attendance/summary') {
      requireRole(user, ['admin', 'manager']);
      const summary = {};
      db.attendance.filter((a) => a.work_date === today()).forEach((a) => {
        summary[a.status] = (summary[a.status] || 0) + 1;
      });
      return {
        summary,
        late_arrivals: attendanceReport(db, parsePath(`/attendance/report?date=${today()}&status=late`))
      };
    }

    if (method === 'POST' && route === '/leave') {
      if (!body?.leave_type || !body?.start_date || !body?.end_date) throw new Error('Type, start date and end date are required');
      if (body.end_date < body.start_date) throw new Error('End date cannot be before start date');
      const overlap = db.leave_requests.some((l) => (
        l.employee_id === user.id &&
        ['pending', 'approved'].includes(l.status) &&
        !(l.end_date < body.start_date || l.start_date > body.end_date)
      ));
      if (overlap) throw new Error('Overlapping leave request exists');
      const row = {
        id: nextId(db.leave_requests),
        employee_id: user.id,
        approved_by: null,
        leave_type: body.leave_type,
        start_date: body.start_date,
        end_date: body.end_date,
        reason: body.reason || '',
        status: 'pending',
        approved_at: null,
        created_at: new Date().toISOString()
      };
      db.leave_requests.push(row);
      const recipientRoles = user.role === 'admin' ? ['manager'] : ['admin', 'manager'];
      db.employees.filter((e) => (
        e.is_active &&
        e.id !== user.id &&
        recipientRoles.includes(e.role)
      )).forEach((e) => {
        db.notifications.push({
          id: nextId(db.notifications),
          employee_id: e.id,
          type: 'leave_request',
          message: `${user.first_name} ${user.last_name} requested ${body.leave_type} leave.`,
          link: '/pages/workspace.html#leave',
          is_read: false,
          created_at: new Date().toISOString()
        });
      });
      saveDb(db);
      return clone(row);
    }

    if (method === 'GET' && route === '/leave/mine') {
      return leaveRows(db, db.leave_requests.filter((l) => l.employee_id === user.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    if (method === 'GET' && route === '/leave/calendar') {
      const year = Number(url.searchParams.get('year') || yearNow());
      const month = Number(url.searchParams.get('month') || 0);
      return leaveRows(db, db.leave_requests.filter((l) => {
        const d = new Date(l.start_date);
        return l.status === 'approved' && d.getFullYear() === year && (!month || d.getMonth() + 1 === month);
      }));
    }

    if (method === 'GET' && route === '/leave') {
      requireRole(user, ['admin', 'manager']);
      let rows = db.leave_requests.slice();
      if (user.role === 'admin') {
        rows = rows.filter((l) => {
          const employee = db.employees.find((e) => e.id === l.employee_id);
          return employee?.role !== 'admin';
        });
      }
      const status = url.searchParams.get('status');
      const employeeId = url.searchParams.get('employee_id');
      if (status) rows = rows.filter((l) => l.status === status);
      if (employeeId) rows = rows.filter((l) => l.employee_id === Number(employeeId));
      return leaveRows(db, rows).sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    const leaveStatusMatch = route.match(/^\/leave\/(\d+)\/status$/);
    if (leaveStatusMatch && method === 'PATCH') {
      requireRole(user, ['admin', 'manager']);
      const row = db.leave_requests.find((l) => l.id === Number(leaveStatusMatch[1]));
      if (!row) throw new Error('Leave request not found');
      if (row.status !== 'pending') throw new Error('Leave request already processed');
      if (!['approved', 'rejected'].includes(body?.status)) throw new Error('Status must be approved or rejected');
      const leaveEmployee = db.employees.find((e) => e.id === row.employee_id);
      if (row.employee_id === user.id) throw new Error('You cannot approve your own leave request');
      if (leaveEmployee?.role === 'admin' && user.role !== 'manager') {
        throw new Error('HR leave requests must be approved by the CEO/manager');
      }
      row.status = body.status;
      row.approved_by = user.id;
      row.approved_at = new Date().toISOString();
      if (row.status === 'approved') {
        for (let d = new Date(row.start_date); d <= new Date(row.end_date); d.setDate(d.getDate() + 1)) {
          if ([0, 6].includes(d.getDay())) continue;
          const workDate = dateOnly(d);
          const existing = db.attendance.find((a) => a.employee_id === row.employee_id && a.work_date === workDate);
          if (existing) existing.status = 'on-leave';
          else db.attendance.push({ id: nextId(db.attendance), employee_id: row.employee_id, work_date: workDate, clock_in: null, clock_out: null, status: 'on-leave', notes: null });
        }
      }
      db.notifications.push({
        id: nextId(db.notifications),
        employee_id: row.employee_id,
        type: `leave_${row.status}`,
        message: `Your ${row.leave_type} leave request has been ${row.status}.`,
        link: null,
        is_read: false,
        created_at: new Date().toISOString()
      });
      saveDb(db);
      return clone(row);
    }

    if (method === 'GET' && route === '/payroll/mine') {
      return db.payroll.filter((p) => p.employee_id === user.id).map((p) => enrichPayroll(db, p));
    }

    if (method === 'GET' && route === '/payroll/summary') {
      requireRole(user, ['admin']);
      const groups = {};
      db.payroll.forEach((p) => {
        const key = `${p.year}-${p.month}`;
        groups[key] ||= { year: p.year, month: p.month, total_net: 0, total_base: 0, total_deductions: 0, employee_count: 0, paid_count: 0 };
        const g = groups[key];
        g.total_base += Number(p.base_salary);
        g.total_deductions += Number(p.deductions);
        g.total_net += Number(enrichPayroll(db, p).net_salary);
        g.employee_count += 1;
        if (p.status === 'paid') g.paid_count += 1;
      });
      return Object.values(groups).sort((a, b) => b.year - a.year || b.month - a.month);
    }

    if (method === 'GET' && route === '/payroll') {
      requireRole(user, ['admin']);
      let rows = db.payroll.slice();
      const month = url.searchParams.get('month');
      const year = url.searchParams.get('year');
      const status = url.searchParams.get('status');
      const employeeId = url.searchParams.get('employee_id');
      if (month) rows = rows.filter((p) => p.month === Number(month));
      if (year) rows = rows.filter((p) => p.year === Number(year));
      if (status) rows = rows.filter((p) => p.status === status);
      if (employeeId) rows = rows.filter((p) => p.employee_id === Number(employeeId));
      return rows.map((p) => enrichPayroll(db, p));
    }

    const payrollUpdateMatch = route.match(/^\/payroll\/(\d+)$/);
    if (payrollUpdateMatch && method === 'PUT') {
      requireRole(user, ['admin']);
      const row = db.payroll.find((p) => p.id === Number(payrollUpdateMatch[1]));
      if (!row) throw new Error('Payroll record not found');
      const status = body?.status || row.status;
      if (!['pending', 'processed', 'paid'].includes(status)) throw new Error('Invalid payroll status');
      const amounts = [body?.base_salary, body?.allowances, body?.tax, body?.other_deductions].map(Number);
      if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) throw new Error('Enter valid non-negative payroll amounts');
      row.base_salary = amounts[0];
      row.allowances = amounts[1];
      row.tax = amounts[2];
      row.other_deductions = amounts[3];
      row.deductions = row.tax + row.other_deductions;
      row.status = status;
      row.paid_at = status === 'paid' ? (row.paid_at || new Date().toISOString()) : null;
      saveDb(db);
      return enrichPayroll(db, row);
    }

    if (method === 'POST' && route === '/payroll/process') {
      requireRole(user, ['admin']);
      const month = Number(body?.month);
      const year = Number(body?.year);
      const employees = db.employees.filter((e) => e.is_active && !db.payroll.some((p) => p.employee_id === e.id && p.month === month && p.year === year));
      if (!employees.length) throw new Error('Payroll already processed for this period');
      employees.forEach((e) => {
        db.payroll.push({
          id: nextId(db.payroll),
          employee_id: e.id,
          month,
          year,
          base_salary: Number(e.salary || 0),
          allowances: Number(e.salary || 0) * 0.05,
          tax: Number(e.salary || 0) * 0.10,
          other_deductions: 0,
          deductions: Number(e.salary || 0) * 0.10,
          status: 'processed',
          paid_at: null,
          created_at: new Date().toISOString()
        });
      });
      saveDb(db);
      return { message: `Payroll processed for ${employees.length} employees`, count: employees.length };
    }

    const payrollPaidMatch = route.match(/^\/payroll\/(\d+)\/paid$/);
    if (payrollPaidMatch && method === 'PATCH') {
      requireRole(user, ['admin']);
      const row = db.payroll.find((p) => p.id === Number(payrollPaidMatch[1]));
      if (!row) throw new Error('Payroll record not found');
      row.status = 'paid';
      row.paid_at = new Date().toISOString();
      saveDb(db);
      return enrichPayroll(db, row);
    }

    const payrollMatch = route.match(/^\/payroll\/(\d+)$/);
    if (payrollMatch && method === 'GET') {
      const row = db.payroll.find((p) => p.id === Number(payrollMatch[1]));
      if (!row) throw new Error('Payslip not found');
      if (user.role === 'employee' && row.employee_id !== user.id) throw new Error('Access denied');
      return enrichPayroll(db, row);
    }

    if (method === 'GET' && route === '/documents/mine') {
      return db.documents
        .filter((d) => d.employee_id === user.id || d.shared_with === user.id || d.share_with_hr && ['admin', 'manager'].includes(user.role))
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .map((d) => ({ ...clone(d), employee_name: employeeName(db, d.employee_id), shared_with_name: d.shared_with ? employeeName(db, d.shared_with) : null }));
    }

    if (method === 'GET' && route === '/todos') {
      return todoRows(db, url);
    }

    if (method === 'POST' && route === '/todos') {
      requireRole(user, ['admin', 'manager']);
      if (!body?.title?.trim()) throw new Error('Title is required');
      if (!['everyone', 'hr', 'managers', 'employee'].includes(body.owner_type)) throw new Error('Assignment is required');
      if (body.owner_type === 'employee' && !body.assigned_employee_id) throw new Error('Select an employee');
      const assigned = body.assigned_employee_id ? db.employees.find((e) => e.id === Number(body.assigned_employee_id)) : null;
      const ownerLabels = { everyone: 'Everyone', hr: 'HR', managers: 'Managers', employee: assigned ? `${assigned.first_name} ${assigned.last_name}` : 'Employee' };
      const row = {
        id: nextId(db.todos),
        title: body.title.trim(),
        detail: body.detail || '',
        owner: ownerLabels[body.owner_type],
        owner_type: body.owner_type,
        assigned_employee_id: body.owner_type === 'employee' ? Number(body.assigned_employee_id) : null,
        due_date: body.due_date || null,
        priority: body.priority || 'Normal',
        link: body.link || '',
        completed: false,
        completed_by: null,
        completed_at: null,
        created_at: new Date().toISOString()
      };
      db.todos.push(row);
      saveDb(db);
      return enrichTodo(db, row);
    }

    const todoUpdateMatch = route.match(/^\/todos\/(\d+)$/);
    if (todoUpdateMatch && method === 'PUT') {
      requireRole(user, ['admin', 'manager']);
      const row = db.todos.find((todo) => todo.id === Number(todoUpdateMatch[1]));
      if (!row) throw new Error('To do item not found');
      if (!body?.title?.trim()) throw new Error('Title is required');
      if (!['everyone', 'hr', 'managers', 'employee'].includes(body.owner_type)) throw new Error('Assignment is required');
      if (body.owner_type === 'employee' && !body.assigned_employee_id) throw new Error('Select an employee');
      const assigned = body.assigned_employee_id ? db.employees.find((e) => e.id === Number(body.assigned_employee_id)) : null;
      const ownerLabels = { everyone: 'Everyone', hr: 'HR', managers: 'Managers', employee: assigned ? `${assigned.first_name} ${assigned.last_name}` : 'Employee' };
      row.title = body.title.trim();
      row.detail = body.detail || '';
      row.owner = ownerLabels[body.owner_type];
      row.owner_type = body.owner_type;
      row.assigned_employee_id = body.owner_type === 'employee' ? Number(body.assigned_employee_id) : null;
      row.due_date = body.due_date || null;
      row.priority = body.priority || 'Normal';
      row.link = body.link || '';
      saveDb(db);
      return enrichTodo(db, row);
    }

    if (todoUpdateMatch && method === 'DELETE') {
      requireRole(user, ['admin', 'manager']);
      const idx = db.todos.findIndex((todo) => todo.id === Number(todoUpdateMatch[1]));
      if (idx === -1) throw new Error('To do item not found');
      db.todos.splice(idx, 1);
      saveDb(db);
      return { message: 'To do item deleted' };
    }

    const todoCompleteMatch = route.match(/^\/todos\/(\d+)\/complete$/);
    if (todoCompleteMatch && method === 'PATCH') {
      const row = db.todos.find((todo) => todo.id === Number(todoCompleteMatch[1]));
      if (!row) throw new Error('To do item not found');
      row.completed = true;
      row.completed_by = user.id;
      row.completed_at = new Date().toISOString();
      saveDb(db);
      return enrichTodo(db, row);
    }

    if (method === 'POST' && route === '/tickets') {
      if (isItDepartmentMember(db, user)) {
        throw new Error('IT Department users can view and complete staff tickets, but cannot submit tickets');
      }
      if (!body?.subject?.trim() || !body?.description?.trim()) throw new Error('Subject and description are required');
      const row = {
        id: nextId(db.it_tickets),
        ticket_number: generateTicketNumber(db),
        employee_id: user.id,
        category: body.category || 'other',
        priority: body.priority || 'medium',
        subject: body.subject.trim(),
        description: body.description.trim(),
        status: 'open',
        response: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_at: null
      };
      db.it_tickets.push(row);
      itDepartmentRecipients(db).forEach((e) => {
        db.notifications.push({ id: nextId(db.notifications), employee_id: e.id, type: 'it_ticket', message: `${user.first_name} ${user.last_name} submitted a ticket.`, link: '/pages/workspace.html#tickets', is_read: false, created_at: new Date().toISOString() });
      });
      saveDb(db);
      return enrichTicket(db, row);
    }

    if (method === 'GET' && route === '/tickets/mine') {
      return db.it_tickets
        .filter((ticket) => ticket.employee_id === user.id)
        .map((ticket) => enrichTicket(db, ticket))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    if (method === 'GET' && route === '/tickets') {
      if (!isItDepartmentUser(db, user)) throw new Error('Only the IT Department can view submitted tickets');
      let rows = db.it_tickets.slice();
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      if (status) rows = rows.filter((ticket) => ticket.status === status);
      if (priority) rows = rows.filter((ticket) => ticket.priority === priority);
      return rows
        .map((ticket) => enrichTicket(db, ticket))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    const ticketMatch = route.match(/^\/tickets\/(\d+)$/);
    if (ticketMatch && method === 'PATCH') {
      if (!isItDepartmentUser(db, user)) throw new Error('Only the IT Department can update tickets');
      const row = db.it_tickets.find((ticket) => ticket.id === Number(ticketMatch[1]));
      if (!row) throw new Error('Ticket not found');
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(body?.status)) throw new Error('Invalid status');
      row.status = body.status;
      row.response = body.response || '';
      row.updated_at = new Date().toISOString();
      row.resolved_at = ['resolved', 'closed'].includes(row.status) ? (row.resolved_at || row.updated_at) : null;
      db.notifications.push({ id: nextId(db.notifications), employee_id: row.employee_id, type: 'it_ticket', message: `Your ticket "${row.subject}" is now ${row.status === 'resolved' ? 'completed' : row.status.replace('_', ' ')}.`, link: '/pages/staff-portal.html#tickets', is_read: false, created_at: new Date().toISOString() });
      saveDb(db);
      return enrichTicket(db, row);
    }

    const todoReopenMatch = route.match(/^\/todos\/(\d+)\/reopen$/);
    if (todoReopenMatch && method === 'PATCH') {
      const row = db.todos.find((todo) => todo.id === Number(todoReopenMatch[1]));
      if (!row) throw new Error('To do item not found');
      row.completed = false;
      row.completed_by = null;
      row.completed_at = null;
      saveDb(db);
      return enrichTodo(db, row);
    }

    if (method === 'GET' && route === '/documents/all') {
      requireRole(user, ['admin', 'manager']);
      return db.documents
        .slice()
        .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
        .map((d) => ({ ...clone(d), employee_name: employeeName(db, d.employee_id), shared_with_name: d.shared_with ? employeeName(db, d.shared_with) : null }));
    }

    if (method === 'POST' && route === '/documents') {
      const file = body?.get ? body.get('document') : null;
      const ownerId = body?.get && body.get('employee_id') ? Number(body.get('employee_id')) : user.id;
      if (ownerId !== user.id && user.role !== 'admin') throw new Error('Only HR can upload for other staff members');
      const row = {
        id: nextId(db.documents),
        employee_id: ownerId,
        doc_type: body?.get ? body.get('doc_type') || 'other' : 'other',
        file_path: '#',
        original_name: file?.name || 'Uploaded document',
        file_size: file?.size || 0,
        share_with_hr: body?.get ? body.get('share_with_hr') === 'true' : true,
        shared_with: body?.get && body.get('shared_with') ? Number(body.get('shared_with')) : null,
        uploaded_at: new Date().toISOString()
      };
      db.documents.push(row);
      saveDb(db);
      return clone(row);
    }

    const docDeleteMatch = route.match(/^\/documents\/(\d+)$/);
    if (docDeleteMatch && method === 'DELETE') {
      const idx = db.documents.findIndex((d) => d.id === Number(docDeleteMatch[1]));
      if (idx === -1) throw new Error('Document not found');
      if (db.documents[idx].employee_id !== user.id && user.role !== 'admin') throw new Error('Access denied');
      db.documents.splice(idx, 1);
      saveDb(db);
      return { message: 'Document deleted' };
    }

    if (method === 'POST' && route === '/performance') {
      requireRole(user, ['admin', 'manager']);
      if (!body?.employee_id || !body?.rating) throw new Error('Employee and rating required');
      const row = {
        id: nextId(db.performance_reviews),
        employee_id: Number(body.employee_id),
        reviewer_id: user.id,
        rating: Number(body.rating),
        comments: body.comments || '',
        review_date: today(),
        period: body.period || '',
        created_at: new Date().toISOString()
      };
      db.performance_reviews.push(row);
      saveDb(db);
      return clone(row);
    }

    if (method === 'GET' && route === '/performance/mine') {
      return db.performance_reviews
        .filter((r) => r.employee_id === user.id)
        .map((r) => ({ ...clone(r), reviewer_name: employeeName(db, r.reviewer_id), reviewer_photo: db.employees.find((e) => e.id === r.reviewer_id)?.photo_url || null }));
    }

    if (method === 'GET' && route === '/performance/team-summary') {
      requireRole(user, ['admin', 'manager']);
      return db.employees.filter((e) => e.is_active).map((e) => {
        const reviews = db.performance_reviews.filter((r) => r.employee_id === e.id);
        return {
          id: e.id,
          name: `${e.first_name} ${e.last_name}`,
          photo_url: e.photo_url,
          job_title: e.job_title,
          department_name: departmentName(db, e.department_id),
          avg_rating: avg(reviews.map((r) => Number(r.rating))),
          review_count: reviews.length,
          last_reviewed: reviews.map((r) => r.review_date).sort().pop() || null
        };
      });
    }

    const perfEmployeeMatch = route.match(/^\/performance\/employee\/(\d+)$/);
    if (perfEmployeeMatch && method === 'GET') {
      const id = Number(perfEmployeeMatch[1]);
      if (user.role === 'employee' && user.id !== id) throw new Error('Access denied');
      return db.performance_reviews
        .filter((r) => r.employee_id === id)
        .map((r) => ({ ...clone(r), reviewer_name: employeeName(db, r.reviewer_id), reviewer_photo: db.employees.find((e) => e.id === r.reviewer_id)?.photo_url || null }));
    }

    if (method === 'POST' && route === '/messages/department') {
      if (!['admin', 'manager'].includes(user.role)) throw new Error('Access denied');
      if (!body?.department_id || !body?.body?.trim()) throw new Error('Department and message body required');
      const department = db.departments.find((item) => item.id === Number(body.department_id));
      if (!department) throw new Error('Department not found');
      const recipients = db.employees.filter((employee) => employee.department_id === department.id && employee.is_active !== false && employee.id !== user.id);
      if (!recipients.length) throw new Error('This department has no other active employees');
      const now = new Date().toISOString();
      recipients.forEach((recipient) => {
        db.messages.push({ id: nextId(db.messages), sender_id: user.id, receiver_id: recipient.id, body: body.body.trim(), is_read: false, sent_at: now });
        db.notifications.push({ id: nextId(db.notifications), employee_id: recipient.id, type: 'message', message: 'New message from ' + user.first_name + ' ' + user.last_name, link: '/pages/messages.html', is_read: false, created_at: now });
      });
      saveDb(db);
      return { department: department.name, sent_count: recipients.length };
    }

    if (method === 'POST' && route === '/messages') {
      if (!body?.receiver_id || !body?.body?.trim()) throw new Error('Receiver and message body required');
      if (Number(body.receiver_id) === user.id) throw new Error('Cannot message yourself');
      const row = { id: nextId(db.messages), sender_id: user.id, receiver_id: Number(body.receiver_id), body: body.body.trim(), is_read: false, sent_at: new Date().toISOString() };
      db.messages.push(row);
      db.notifications.push({ id: nextId(db.notifications), employee_id: row.receiver_id, type: 'message', message: `New message from ${user.first_name} ${user.last_name}`, link: '/pages/messages.html', is_read: false, created_at: new Date().toISOString() });
      saveDb(db);
      return clone(row);
    }

    if (method === 'POST' && route === '/messages/team') {
      if (!body?.body?.trim()) throw new Error('Message body required');
      const row = { id: nextId(db.team_messages), sender_id: user.id, body: body.body.trim(), sent_at: new Date().toISOString() };
      db.team_messages.push(row);
      saveDb(db);
      return clone(row);
    }

    const teamMessageMatch = route.match(/^\/messages\/team\/(\d+)$/);
    if (teamMessageMatch && method === 'PUT') {
      const row = db.team_messages.find((message) => message.id === Number(teamMessageMatch[1]) && message.sender_id === user.id);
      if (!row) throw new Error('Sent team message not found');
      if (!body?.body?.trim()) throw new Error('Message body required');
      row.body = body.body.trim();
      row.edited_at = new Date().toISOString();
      saveDb(db);
      return clone(row);
    }

    if (teamMessageMatch && method === 'DELETE') {
      const index = db.team_messages.findIndex((message) => message.id === Number(teamMessageMatch[1]) && message.sender_id === user.id);
      if (index < 0) throw new Error('Sent team message not found');
      const [row] = db.team_messages.splice(index, 1);
      saveDb(db);
      return { message: 'Team message deleted', id: row.id };
    }

    const directMessageMatch = route.match(/^\/messages\/(\d+)$/);
    if (directMessageMatch && method === 'PUT') {
      const row = db.messages.find((message) => message.id === Number(directMessageMatch[1]) && message.sender_id === user.id);
      if (!row) throw new Error('Sent message not found');
      if (!body?.body?.trim()) throw new Error('Message body required');
      row.body = body.body.trim();
      row.edited_at = new Date().toISOString();
      saveDb(db);
      return clone(row);
    }

    if (directMessageMatch && method === 'DELETE') {
      const index = db.messages.findIndex((message) => message.id === Number(directMessageMatch[1]) && message.sender_id === user.id);
      if (index < 0) throw new Error('Sent message not found');
      const [row] = db.messages.splice(index, 1);
      saveDb(db);
      return { message: 'Message deleted', id: row.id };
    }

    if (method === 'GET' && route === '/messages/team') {
      return db.team_messages
        .slice()
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        .map((m) => ({ ...clone(m), sender_name: employeeName(db, m.sender_id), sender_photo: db.employees.find((e) => e.id === m.sender_id)?.photo_url || null }));
    }

    if (method === 'GET' && route === '/messages/inbox') {
      const partnerIds = [...new Set(db.messages
        .filter((m) => m.sender_id === user.id || m.receiver_id === user.id)
        .map((m) => m.sender_id === user.id ? m.receiver_id : m.sender_id))];
      return partnerIds.map((id) => {
        const emp = db.employees.find((e) => e.id === id) || {};
        const thread = db.messages
          .filter((m) => (m.sender_id === user.id && m.receiver_id === id) || (m.sender_id === id && m.receiver_id === user.id))
          .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
        const last = thread[thread.length - 1];
        return {
          id,
          first_name: emp.first_name,
          last_name: emp.last_name,
          photo_url: emp.photo_url,
          job_title: emp.job_title,
          last_msg_time: last?.sent_at || null,
          last_message: last?.body || '',
          unread_count: thread.filter((m) => m.sender_id === id && m.receiver_id === user.id && !m.is_read).length
        };
      }).sort((a, b) => String(b.last_msg_time).localeCompare(String(a.last_msg_time)));
    }

    if (method === 'GET' && route === '/messages/unread-count') {
      return { count: db.messages.filter((m) => m.receiver_id === user.id && !m.is_read).length };
    }

    const conversationMatch = route.match(/^\/messages\/conversation\/(\d+)$/);
    if (conversationMatch && method === 'GET') {
      const otherId = Number(conversationMatch[1]);
      const rows = db.messages
        .filter((m) => (m.sender_id === user.id && m.receiver_id === otherId) || (m.sender_id === otherId && m.receiver_id === user.id))
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        .map((m) => ({ ...clone(m), sender_name: employeeName(db, m.sender_id), sender_photo: db.employees.find((e) => e.id === m.sender_id)?.photo_url || null }));
      db.messages.forEach((m) => {
        if (m.sender_id === otherId && m.receiver_id === user.id) m.is_read = true;
      });
      saveDb(db);
      return rows;
    }

    if (method === 'GET' && route === '/notifications/mine') {
      return db.notifications.filter((n) => n.employee_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(clone);
    }

    if (method === 'GET' && route === '/notifications/unread-count') {
      return { count: db.notifications.filter((n) => n.employee_id === user.id && !n.is_read).length };
    }

    if (method === 'PATCH' && route === '/notifications/read-all') {
      db.notifications.forEach((n) => {
        if (n.employee_id === user.id) n.is_read = true;
      });
      saveDb(db);
      return { message: 'All notifications marked as read' };
    }

    const notifReadMatch = route.match(/^\/notifications\/(\d+)\/read$/);
    if (notifReadMatch && method === 'PATCH') {
      const row = db.notifications.find((n) => n.id === Number(notifReadMatch[1]) && n.employee_id === user.id);
      if (row) row.is_read = true;
      saveDb(db);
      return { message: 'Marked as read' };
    }

    if (method === 'POST' && route === '/notifications/announce') {
      requireRole(user, ['admin']);
      if (!body?.title || !body?.body) throw new Error('Title and body required');
      const row = { id: nextId(db.announcements), created_by: user.id, title: body.title, body: body.body, is_pinned: !!body.is_pinned, created_at: new Date().toISOString() };
      db.announcements.push(row);
      db.employees.filter((e) => e.is_active).forEach((e) => {
        db.notifications.push({ id: nextId(db.notifications), employee_id: e.id, type: 'announcement', message: `Announcement: ${body.title}`, link: '/pages/staff-portal.html#announcements', is_read: false, created_at: new Date().toISOString() });
      });
      saveDb(db);
      return clone(row);
    }

    if (method === 'GET' && route === '/notifications/announcements') {
      return db.announcements
        .map((a) => ({ ...clone(a), author_name: employeeName(db, a.created_by), photo_url: db.employees.find((e) => e.id === a.created_by)?.photo_url || null }))
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.created_at.localeCompare(a.created_at));
    }

    const announcementMatch = route.match(/^\/notifications\/announcements\/(\d+)$/);
    if (announcementMatch && method === 'PUT') {
      requireRole(user, ['admin']);
      if (!body?.title || !body?.body) throw new Error('Title and body required');
      const row = db.announcements.find((a) => a.id === Number(announcementMatch[1]));
      if (!row) throw new Error('Announcement not found');
      row.title = body.title;
      row.body = body.body;
      row.is_pinned = !!body.is_pinned;
      saveDb(db);
      return clone(row);
    }

    if (announcementMatch && method === 'DELETE') {
      requireRole(user, ['admin']);
      const idx = db.announcements.findIndex((a) => a.id === Number(announcementMatch[1]));
      if (idx === -1) throw new Error('Announcement not found');
      db.announcements.splice(idx, 1);
      saveDb(db);
      return { message: 'Announcement deleted' };
    }

    if (method === 'GET' && route === '/orgchart/tree') return orgTree(db);

    if (method === 'GET' && route === '/orgchart/departments') {
      return db.departments.map((d) => ({
        id: d.id,
        name: d.name,
        manager_name: d.manager_id ? employeeName(db, d.manager_id) : null,
        manager_photo: db.employees.find((e) => e.id === d.manager_id)?.photo_url || null,
        manager_title: db.employees.find((e) => e.id === d.manager_id)?.job_title || null,
        employee_count: db.employees.filter((e) => e.is_active && e.department_id === d.id).length,
        members: db.employees
          .filter((e) => e.is_active && e.department_id === d.id && e.id !== d.manager_id)
          .map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, job_title: e.job_title, photo_url: e.photo_url }))
      }));
    }

    throw new Error(`Mock endpoint not implemented: ${method} ${route}`);
  }

  window.hrMockApi = {
    async request(method, path, body) {
      try {
        return clone(await handle(method, path, body));
      } catch (err) {
        if (err.status === 401) {
          localStorage.removeItem('hr_token');
          localStorage.removeItem('hr_user');
          const staffPath = window.location.pathname.includes('staff-');
          const loginPath = staffPath ? '/pages/staff-login.html' : '/pages/login.html';
          window.location.href = window.appUrl ? window.appUrl(loginPath) : loginPath;
          return;
        }
        throw err;
      }
    },
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      return loadDb();
    }
  };
})();
