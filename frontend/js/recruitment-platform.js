/* Shared Recruitment workspace navigation and small display helpers. */
(function recruitmentPlatformScope() {
  'use strict';

  const recruitmentRoutes = [
    { id: 'dashboard', label: 'Dashboard', href: 'recruitment.html', group: 'overview', icon: 'dashboard' },
    { id: 'requests', label: 'Requests', href: 'recruitment-requests.html', group: 'planning', icon: 'request' },
    { id: 'requisitions', label: 'Requisitions', href: 'recruitment-requisitions.html', group: 'planning', icon: 'requisition' },
    { id: 'postings', label: 'Job postings', href: 'recruitment-postings.html', group: 'planning', icon: 'posting' },
    { id: 'applications', label: 'Applications', href: 'applications.html', group: 'hiring', icon: 'application' },
    { id: 'pipeline', label: 'Pipeline', href: 'recruitment-pipeline.html', group: 'hiring', icon: 'pipeline' },
    { id: 'interviews', label: 'Interviews', href: 'recruitment-interviews.html', group: 'hiring', icon: 'interview' },
    { id: 'offers', label: 'Offers', href: 'recruitment-offers.html', group: 'hiring', icon: 'offer' },
    { id: 'settings', label: 'Settings', href: 'recruitment-settings.html', group: 'settings', icon: 'settings' }
  ];

  const recruitmentIconPaths = Object.freeze({
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect>',
    request: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4.5h6v3H9z"></path><path d="m9 14 2 2 4-4"></path>',
    requisition: '<path d="M4 7h16v12H4z"></path><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><path d="M4 12h16M10 15h4"></path>',
    posting: '<path d="M4 11h3l7-5v12l-7-5H4z"></path><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10"></path>',
    application: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><circle cx="10" cy="14" r="2"></circle><path d="M7 19a3 3 0 0 1 6 0"></path>',
    pipeline: '<circle cx="5" cy="6" r="2"></circle><circle cx="19" cy="6" r="2"></circle><circle cx="12" cy="18" r="2"></circle><path d="M7 7.5 10.5 16M17 7.5 13.5 16"></path>',
    interview: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M7 3v4M17 3v4M3 10h18"></path><path d="M8 14h3M8 17h6"></path>',
    offer: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="m8 16 2 2 5-5"></path>',
    candidate: '<circle cx="9" cy="8" r="3"></circle><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 5M17.5 20a4.5 4.5 0 0 0-2.25-3.9"></path>',
    search: '<circle cx="10.5" cy="10.5" r="5.5"></circle><path d="m15 15 5 5"></path>',
    star: '<path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9z"></path>',
    shield: '<path d="M12 3 19 6v5c0 4.5-2.9 8.2-7 10-4.1-1.8-7-5.5-7-10V6z"></path><path d="m9 12 2 2 4-4"></path>',
    target: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2"></path>',
    x: '<circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6m0-6-6 6"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.08A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.52.6z"></path>',
    arrow_right: '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>'
  });

  const stageLabels = {
    application: 'Application',
    applied: 'Applied',
    screening: 'Screening',
    shortlist: 'Shortlisting',
    shortlisting: 'Shortlisting',
    assessment: 'Assessment',
    assessments: 'Assessments',
    interview: 'Interview',
    interviews: 'Interviews',
    reference_check: 'Reference check',
    reference_checks: 'Reference checks',
    selection: 'Selection',
    offer: 'Job offer',
    offer_acceptance: 'Offer acceptance',
    pre_employment: 'Pre-employment',
    onboarding: 'Onboarding',
    hired: 'Hired',
    rejected: 'Not selected',
    withdrawn: 'Withdrawn'
  };

  const statusLabels = {
    draft: 'Draft',
    pending: 'Pending',
    submitted: 'Submitted',
    approved: 'Approved',
    declined: 'Declined',
    rejected: 'Rejected',
    open: 'Open',
    active: 'Active',
    inactive: 'Inactive',
    paused: 'Paused',
    closed: 'Closed',
    cancelled: 'Cancelled',
    published: 'Published',
    filled: 'Filled',
    expired: 'Expired',
    applied: 'Applied',
    screening: 'Screening',
    shortlisted: 'Shortlisted',
    assessment: 'Assessment',
    interview: 'Interview',
    reference_check: 'Reference check',
    selected: 'Selected',
    offer: 'Job offer',
    sent: 'Sent',
    accepted: 'Accepted',
    offer_accepted: 'Offer accepted',
    pre_employment: 'Pre-employment',
    onboarding: 'Onboarding',
    hired: 'Hired',
    withdrawn: 'Withdrawn',
    no_show: 'No show',
    scheduled: 'Scheduled',
    completed: 'Completed'
  };

  const aliases = {
    recruitment: 'dashboard',
    recruitment_dashboard: 'dashboard',
    job_openings: 'postings',
    job_postings: 'postings',
    candidates: 'applications',
    candidate: 'applications',
    configuration: 'settings'
  };

  function recruitmentEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function normaliseRecruitmentKey(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  function recruitmentIcon(name, className = '') {
    const iconName = normaliseRecruitmentKey(name);
    const paths = recruitmentIconPaths[iconName] || recruitmentIconPaths.dashboard;
    const requestedClass = String(className || '').replace(/[^a-z0-9_\-\s]/gi, ' ').trim();
    const classes = `recruitment-svg-icon${requestedClass ? ` ${requestedClass}` : ''}`;
    return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  }

  function humaniseRecruitmentKey(value) {
    const key = normaliseRecruitmentKey(value);
    if (!key) return '-';
    return key.split('_').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function recruitmentStageLabel(stage) {
    const key = normaliseRecruitmentKey(stage);
    return stageLabels[key] || humaniseRecruitmentKey(stage);
  }

  function recruitmentStatusLabel(status) {
    const key = normaliseRecruitmentKey(status);
    return statusLabels[key] || stageLabels[key] || humaniseRecruitmentKey(status);
  }

  function recruitmentNotice(message, type = 'info') {
    const notice = document.getElementById('recruitment-notice');
    if (!notice) return false;

    const requestedType = String(type || 'info').toLowerCase();
    const normalisedType = ['success', 'warning', 'error', 'info'].includes(requestedType) ? requestedType : 'info';
    const text = String(message ?? '').trim();
    notice.className = `recruitment-notice recruitment-notice--${normalisedType}`;
    notice.hidden = !text;
    notice.setAttribute('role', normalisedType === 'error' ? 'alert' : 'status');
    notice.setAttribute('aria-live', normalisedType === 'error' ? 'assertive' : 'polite');
    notice.textContent = text;
    return true;
  }

  function recruitmentRouteId(active) {
    const requested = normaliseRecruitmentKey(active || 'dashboard');
    const id = aliases[requested] || requested;
    return recruitmentRoutes.some((route) => route.id === id) ? id : 'dashboard';
  }

  function renderRecruitmentNavigation(active) {
    const navigation = document.getElementById('recruitment-nav');
    if (!navigation) return false;

    const activeId = recruitmentRouteId(active);
    let previousGroup = '';
    const links = recruitmentRoutes.map((route) => {
      const divider = previousGroup && previousGroup !== route.group
        ? '<span class="recruitment-platform-nav__divider" aria-hidden="true"></span>'
        : '';
      previousGroup = route.group;
      const isActive = route.id === activeId;
      return `${divider}<a class="recruitment-platform-nav__link${isActive ? ' is-active' : ''}" href="${route.href}"${isActive ? ' aria-current="page"' : ''}>${recruitmentIcon(route.icon, 'recruitment-platform-nav__icon')}<span>${recruitmentEscape(route.label)}</span></a>`;
    }).join('');

    navigation.className = 'recruitment-platform-nav';
    navigation.setAttribute('aria-label', 'Recruitment workspace');
    navigation.innerHTML = `
      <div class="recruitment-platform-nav__header">
        <div>
          <span class="recruitment-platform-nav__eyebrow">Talent acquisition</span>
          <div class="recruitment-platform-nav__title">Recruitment workspace</div>
        </div>
        <span class="recruitment-platform-nav__hint">Plan, hire, and hand off to onboarding.</span>
      </div>
      <div class="recruitment-platform-nav__scroll">
        <div class="recruitment-platform-nav__links">${links}</div>
      </div>`;
    return true;
  }

  function initRecruitmentPlatform(active = 'dashboard') {
    const user = requireAuth();
    if (!user) return null;

    // The parent workspace already owns these controls. Rebuilding them inside
    // its iframe briefly creates a second shell, then removes it on load.
    if (!isEmbeddedWorkspacePage()) {
      buildSidebar('recruitment');
      Promise.resolve(loadNotifCount()).catch(() => {});
      renderRecruitmentNavigation(active);
    } else {
      // The workspace sidebar is the only recruitment navigation in an
      // embedded route. Remove the direct-visit fallback so it cannot reserve
      // an invisible block above the page heading.
      document.getElementById('recruitment-nav')?.remove();
    }
    return user;
  }

  window.recruitmentRoutes = recruitmentRoutes.slice();
  window.recruitmentEscape = recruitmentEscape;
  window.recruitmentIcon = recruitmentIcon;
  window.recruitmentStageLabel = recruitmentStageLabel;
  window.recruitmentStatusLabel = recruitmentStatusLabel;
  window.recruitmentNotice = recruitmentNotice;
  window.renderRecruitmentNavigation = renderRecruitmentNavigation;
  window.initRecruitmentPlatform = initRecruitmentPlatform;
}());
