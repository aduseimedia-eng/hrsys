(function () {
  const today = new Date();
  const iso = (offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  window.hrSuiteData = {
    modules: [
      {
        page: 'hiring',
        title: 'Hiring & ATS',
        eyebrow: 'Talent acquisition',
        metric: '4 open roles',
        status: '12 active candidates',
        summary: 'Manage requisitions, candidates, interviews, offers, and handoff into onboarding.',
        health: 78
      },
      {
        page: 'onboarding',
        title: 'Onboarding',
        eyebrow: 'First 90 days',
        metric: '3 new hires',
        status: '86% task completion',
        summary: 'Track packets, checklists, equipment, policy acknowledgements, and first-week readiness.',
        health: 86
      },
      {
        page: 'benefits',
        title: 'Benefits',
        eyebrow: 'Enrollment',
        metric: '91% enrolled',
        status: '2 changes pending',
        summary: 'Centralize medical, dental, retirement, dependents, deductions, and broker-ready exports.',
        health: 91
      },
      {
        page: 'reports',
        title: 'Reports & Workflows',
        eyebrow: 'People intelligence',
        metric: '12 saved views',
        status: '7 automations active',
        summary: 'Answer HR questions with dashboards, saved reports, workflow queues, and suggested actions.',
        health: 88
      }
    ],

    hiring: {
      requisitions: [
        { id: 'REQ-1042', title: 'Senior Backend Engineer', department: 'IT Department', owner: 'Kwame Mensah', location: 'Accra / Hybrid', stage: 'Interviewing', applicants: 42, daysOpen: 18, priority: 'High' },
        { id: 'REQ-1044', title: 'People Operations Partner', department: 'HR/ Admin', owner: 'Ama Owusu', location: 'Accra', stage: 'Offer', applicants: 23, daysOpen: 12, priority: 'High' },
        { id: 'REQ-1047', title: 'Account Associate', department: 'Account Department', owner: 'Ama Owusu', location: 'Cape Coast', stage: 'Screening', applicants: 31, daysOpen: 9, priority: 'Medium' },
        { id: 'REQ-1050', title: 'Public Relations Lead', department: 'Public Relations', owner: 'Yaw Darko', location: 'Remote', stage: 'Sourcing', applicants: 16, daysOpen: 5, priority: 'Medium' }
      ],
      pipeline: [
        { stage: 'Applied', count: 46, candidates: ['Nana Agyemang', 'Esi Larbi', 'Daniel Appiah'] },
        { stage: 'Screening', count: 18, candidates: ['Selasi Tetteh', 'Mawuli Adjei', 'Afia Osei'] },
        { stage: 'Interview', count: 9, candidates: ['Kojo Mensah', 'Abigail Turkson', 'Edem Doe'] },
        { stage: 'Offer', count: 3, candidates: ['Adjoa Sarfo', 'Michael Annan', 'Rita Bediako'] },
        { stage: 'Hired', count: 2, candidates: ['Priscilla Dapaah', 'Kweku Arthur'] }
      ],
      interviews: [
        { candidate: 'Kojo Mensah', role: 'Senior Backend Engineer', panel: 'Technical panel', date: iso(1), time: '10:30', mode: 'Video' },
        { candidate: 'Adjoa Sarfo', role: 'People Operations Partner', panel: 'Culture interview', date: iso(2), time: '14:00', mode: 'Office' },
        { candidate: 'Rita Bediako', role: 'Account Associate', panel: 'Final interview', date: iso(3), time: '11:00', mode: 'Video' }
      ],
      scorecards: [
        { label: 'Candidate response time', value: '18h', trend: 'down 22%' },
        { label: 'Offer acceptance', value: '82%', trend: 'up 6%' },
        { label: 'Time to fill', value: '24d', trend: 'down 4d' },
        { label: 'Hiring team SLA', value: '91%', trend: 'healthy' }
      ]
    },

    onboarding: {
      cohorts: [
        { name: 'Priscilla Dapaah', role: 'Customer Success Manager', department: 'Operations', startDate: iso(7), owner: 'Ama Owusu', completion: 72, status: 'In progress' },
        { name: 'Kweku Arthur', role: 'Data Analyst', department: 'Account Department', startDate: iso(14), owner: 'Abena Frimpong', completion: 58, status: 'Needs equipment' },
        { name: 'Mina Lawson', role: 'UX Designer', department: 'Public Relations', startDate: iso(21), owner: 'Yaw Darko', completion: 84, status: 'Ready' }
      ],
      checklist: [
        { task: 'Send offer packet and welcome message', owner: 'HR', due: iso(-2), done: true },
        { task: 'Collect bank, tax, and emergency contact forms', owner: 'New hire', due: iso(1), done: true },
        { task: 'Prepare laptop, email, and system access', owner: 'IT', due: iso(3), done: false },
        { task: 'Assign buddy and first-week agenda', owner: 'Manager', due: iso(4), done: false },
        { task: 'Schedule 30/60/90-day check-ins', owner: 'HRBP', due: iso(8), done: false }
      ],
      templates: [
        { title: 'IT Department onboarding packet', steps: 18, lastUsed: 'Used 4 times this quarter' },
        { title: 'Manager first-week checklist', steps: 12, lastUsed: 'Used 7 times this quarter' },
        { title: 'Remote employee setup', steps: 15, lastUsed: 'Used 3 times this quarter' }
      ]
    },

    benefits: {
      plans: [
        { type: 'Medical', provider: 'Premier Health', enrolled: 32, eligible: 36, monthlyCost: 18400, renewal: iso(45), status: 'Active' },
        { type: 'Dental', provider: 'BrightCare Dental', enrolled: 29, eligible: 36, monthlyCost: 4100, renewal: iso(45), status: 'Active' },
        { type: 'Retirement', provider: 'FutureFund', enrolled: 34, eligible: 36, monthlyCost: 9600, renewal: iso(120), status: 'Active' },
        { type: 'Life Insurance', provider: 'SecureLife', enrolled: 27, eligible: 36, monthlyCost: 2600, renewal: iso(90), status: 'Review' }
      ],
      events: [
        { employee: 'Akosua Boateng', event: 'Dependent update', plan: 'Medical', status: 'Pending approval', due: iso(2) },
        { employee: 'Kofi Asante', event: 'New enrollment', plan: 'Retirement', status: 'Ready for payroll sync', due: iso(4) },
        { employee: 'Yaw Darko', event: 'Beneficiary change', plan: 'Life Insurance', status: 'Needs document', due: iso(6) }
      ],
      deductions: [
        { label: 'Medical', value: 18400 },
        { label: 'Dental', value: 4100 },
        { label: 'Retirement', value: 9600 },
        { label: 'Life', value: 2600 }
      ]
    },

    reports: {
      metrics: [
        { label: 'Headcount growth', value: '+12%', note: 'rolling 90 days' },
        { label: 'Turnover risk', value: '6%', note: 'low risk segment' },
        { label: 'Time-to-fill', value: '24d', note: '4 days faster' },
        { label: 'Review coverage', value: '78%', note: 'cycle progress' }
      ],
      savedReports: [
        { title: 'Headcount by department', owner: 'Ama Owusu', cadence: 'Weekly', lastRun: iso(-1), audience: 'Leadership' },
        { title: 'Payroll readiness exceptions', owner: 'Account Department', cadence: 'Monthly', lastRun: iso(-4), audience: 'Account Department + HR/ Admin' },
        { title: 'Leave liability forecast', owner: 'People Ops', cadence: 'Monthly', lastRun: iso(-8), audience: 'People managers' },
        { title: 'Performance calibration', owner: 'HRBP', cadence: 'Quarterly', lastRun: iso(-12), audience: 'Executive team' }
      ],
      automations: [
        { title: 'Route leave requests to manager', trigger: 'New leave request', status: 'Active', runs: 18 },
        { title: 'Create onboarding checklist after hire', trigger: 'Candidate marked hired', status: 'Active', runs: 5 },
        { title: 'Payroll change approval', trigger: 'Salary or benefits change', status: 'Active', runs: 9 },
        { title: 'Review reminder sequence', trigger: 'Cycle opens', status: 'Draft', runs: 0 }
      ],
      questions: [
        'Which departments are growing fastest?',
        'Who has onboarding tasks due this week?',
        'Which benefits changes need payroll review?',
        'What roles have the longest time-to-fill?'
      ]
    }
  };
})();
