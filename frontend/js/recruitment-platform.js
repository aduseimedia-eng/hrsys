/* Shared Recruitment workspace navigation and small display helpers. */
(function recruitmentPlatformScope() {
  'use strict';

  const recruitmentRoutes = [
    { id: 'dashboard', label: 'Dashboard', href: 'recruitment.html', group: 'overview' },
    { id: 'requests', label: 'Requests', href: 'recruitment-requests.html', group: 'planning' },
    { id: 'requisitions', label: 'Requisitions', href: 'recruitment-requisitions.html', group: 'planning' },
    { id: 'postings', label: 'Job postings', href: 'recruitment-postings.html', group: 'planning' },
    { id: 'applications', label: 'Applications', href: 'applications.html', group: 'hiring' },
    { id: 'pipeline', label: 'Pipeline', href: 'recruitment-pipeline.html', group: 'hiring' },
    { id: 'interviews', label: 'Interviews', href: 'recruitment-interviews.html', group: 'hiring' },
    { id: 'offers', label: 'Offers', href: 'recruitment-offers.html', group: 'hiring' },
    { id: 'settings', label: 'Settings', href: 'recruitment-settings.html', group: 'settings' }
  ];

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
      return `${divider}<a class="recruitment-platform-nav__link${isActive ? ' is-active' : ''}" href="${route.href}"${isActive ? ' aria-current="page"' : ''}>${recruitmentEscape(route.label)}</a>`;
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

    buildSidebar('recruitment');
    Promise.resolve(loadNotifCount()).catch(() => {});
    renderRecruitmentNavigation(active);
    return user;
  }

  window.recruitmentRoutes = recruitmentRoutes.slice();
  window.recruitmentEscape = recruitmentEscape;
  window.recruitmentStageLabel = recruitmentStageLabel;
  window.recruitmentStatusLabel = recruitmentStatusLabel;
  window.recruitmentNotice = recruitmentNotice;
  window.renderRecruitmentNavigation = renderRecruitmentNavigation;
  window.initRecruitmentPlatform = initRecruitmentPlatform;
}());
