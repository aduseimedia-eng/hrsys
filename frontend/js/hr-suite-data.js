(function () {
  // Empty application state for modules that have not yet been configured.
  // Real records are created by HR users within each module.
  window.hrSuiteData = {
    modules: [
      { page: 'recruitment', title: 'Recruitment', eyebrow: 'Talent acquisition', metric: 'No roles yet', status: 'Create a requisition to begin', summary: 'Manage recruitment requests, job postings, candidates, offers, and the handoff to onboarding.', health: 0 },
      { page: 'onboarding', title: 'Onboarding', eyebrow: 'First 90 days', metric: 'No new hires', status: 'Create an onboarding packet', summary: 'Track packets, checklists, equipment, policy acknowledgements, and first-week readiness.', health: 0 },
      { page: 'benefits', title: 'Benefits', eyebrow: 'Enrollment', metric: 'No plans yet', status: 'Add a benefit plan to begin', summary: 'Centralize medical, retirement, dependents, deductions, and broker-ready exports.', health: 0 },
      { page: 'reports', title: 'Reports & Workflows', eyebrow: 'People intelligence', metric: 'No saved reports', status: 'Build a report from your data', summary: 'Answer HR questions with dashboards, saved reports, workflow queues, and suggested actions.', health: 0 }
    ],
    hiring: {
      requisitions: [],
      interviews: [],
      pipeline: [
        { stage: 'Applied', candidates: [] },
        { stage: 'Screening', candidates: [] },
        { stage: 'Interview', candidates: [] },
        { stage: 'Offer', candidates: [] },
        { stage: 'Hired', candidates: [] }
      ]
    },
    onboarding: { cohorts: [], checklist: [], templates: [] },
    benefits: { plans: [], events: [], deductions: [] },
    reports: { metrics: [], savedReports: [], automations: [], questions: [] }
  };
})();
