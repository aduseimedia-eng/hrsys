// frontend/js/api.js — Centralized API client
const API_BASE = 'http://localhost:5000/api';
const USE_MOCK_API = true;
let mockApiLoadPromise = null;

const APP_BASE = (() => {
  const path = window.location.pathname;
  const pagesIndex = path.indexOf('/pages/');
  if (pagesIndex >= 0) return path.slice(0, pagesIndex);
  if (window.location.hostname.endsWith('github.io')) {
    const [repo] = path.split('/').filter(Boolean);
    return repo ? `/${repo}` : '';
  }
  return '';
})();

function appUrl(path) {
  if (!path) return APP_BASE || '/';
  if (/^(https?:|data:|blob:|#)/.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE}${cleanPath}`;
}

window.appUrl = appUrl;

function isAdminWorkspace() {
  return /\/pages\/workspace\.html$/i.test(window.location.pathname);
}

function adminWorkspaceUrl(page) {
  return appUrl(`/pages/workspace.html#${page}`);
}

function isEmbeddedWorkspacePage() {
  return window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1';
}

function activateEmbeddedWorkspacePage() {
  if (!isEmbeddedWorkspacePage() || !document.body || document.body.classList.contains('embedded-page')) return;
  document.body.classList.add('embedded-page');

  const style = document.createElement('style');
  style.textContent = `
    body.embedded-page {
      overflow: auto !important;
      background: var(--bg-page) !important;
    }
    body.embedded-page .app-shell {
      display: block !important;
      height: auto !important;
      min-height: 100vh !important;
      overflow: visible !important;
    }
    body.embedded-page .sidebar,
    body.embedded-page .topbar,
    body.embedded-page .sidebar-backdrop {
      display: none !important;
    }
    body.embedded-page .main-content {
      min-height: auto !important;
      width: 100% !important;
      max-width: none !important;
      padding: 22px !important;
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', activateEmbeddedWorkspacePage);
} else {
  activateEmbeddedWorkspacePage();
}

function ensureMockApi() {
  if (window.hrMockApi) return Promise.resolve(window.hrMockApi);
  if (!mockApiLoadPromise) {
    mockApiLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = appUrl('/js/mock-api.js');
      script.onload = () => resolve(window.hrMockApi);
      script.onerror = () => reject(new Error('Could not load local mock API'));
      document.head.appendChild(script);
    });
  }
  return mockApiLoadPromise;
}

const api = {
  // ─── Token management ─────────────────────────────────────
  getToken() { return localStorage.getItem('hr_token'); },
  setToken(t) { localStorage.setItem('hr_token', t); },
  getUser()   { return JSON.parse(localStorage.getItem('hr_user') || 'null'); },
  setUser(u)  { localStorage.setItem('hr_user', JSON.stringify(u)); },
  clearAuth() { localStorage.removeItem('hr_token'); localStorage.removeItem('hr_user'); },

  // ─── Core fetch ───────────────────────────────────────────
  async request(method, path, body = null, opts = {}) {
    if (USE_MOCK_API) {
      const mockApi = await ensureMockApi();
      return mockApi.request(method, path, body, opts);
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body && !(body instanceof FormData)) {
      config.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      delete headers['Content-Type'];
      config.body = body;
    }

    const res = await fetch(`${API_BASE}${path}`, config);

    if (res.status === 401) {
      this.clearAuth();
      const staffPath = window.location.pathname.includes('staff-');
      window.location.href = appUrl(staffPath ? '/pages/staff-login.html' : '/pages/login.html');
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get(path)          { return this.request('GET', path); },
  post(path, body)   { return this.request('POST', path, body); },
  put(path, body)    { return this.request('PUT', path, body); },
  patch(path, body)  { return this.request('PATCH', path, body); },
  delete(path)       { return this.request('DELETE', path); },
  upload(path, form) { return this.request('POST', path, form); },
};

// ─── Auth guard (call on every protected page) ─────────────
function requireAuth() {
  const token = api.getToken();
  const user  = api.getUser();
  if (!token || !user || !['admin', 'manager'].includes(user.role)) {
    api.clearAuth();
    window.location.href = appUrl('/pages/login.html');
    return null;
  }
  return user;
}

// ─── Role guard ────────────────────────────────────────────
function requireStaffAuth() {
  const token = api.getToken();
  const user  = api.getUser();
  if (!token || !user || user.role === 'admin') {
    api.clearAuth();
    window.location.href = appUrl('/pages/staff-login.html');
    return null;
  }
  return user;
}

function requireRole(...roles) {
  const user = requireAuth();
  if (user && !roles.includes(user.role)) {
    window.location.href = adminWorkspaceUrl('dashboard');
    return null;
  }
  return user;
}

// ─── Toast notification system ─────────────────────────────
function toast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 6L9 17l-5-5"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>`,
  };

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toastIn .2s ease reverse';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

// ─── Format helpers ─────────────────────────────────────────
const fmt = {
  date(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  },
  time(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  },
  datetime(d) {
    if (!d) return '—';
    return `${fmt.date(d)} ${fmt.time(d)}`;
  },
  currency(n, currency = 'GHS') {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-GH', { style:'currency', currency }).format(n);
  },
  duration(clockIn, clockOut) {
    if (!clockIn || !clockOut) return '—';
    const ms = new Date(clockOut) - new Date(clockIn);
    const h  = Math.floor(ms / 3600000);
    const m  = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  },
  initials(firstName, lastName) {
    return `${(firstName||'')[0] || ''}${(lastName||'')[0] || ''}`.toUpperCase();
  },
  relativeTime(d) {
    const diff = Date.now() - new Date(d);
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return fmt.date(d);
  },
  statusBadge(status) {
    const map = {
      present:   'badge-success',  late:      'badge-warning',
      absent:    'badge-danger',   'on-leave':'badge-info',
      approved:  'badge-success',  rejected:  'badge-danger',
      pending:   'badge-warning',  cancelled: 'badge-neutral',
      processed: 'badge-info',     paid:      'badge-success',
      active:    'badge-success',  inactive:  'badge-neutral',
      admin:     'badge-violet',   manager:   'badge-info',
      employee:  'badge-neutral',
    };
    const cls = map[status] || 'badge-neutral';
    return `<span class="badge ${cls}">${status}</span>`;
  }
};

// ─── Avatar helper ──────────────────────────────────────────
function avatarEl(employee, size = 'md') {
  if (employee.photo_url) {
    return `<img src="${assetUrl(employee.photo_url)}" 
                 alt="${employee.first_name}" 
                 class="avatar avatar-${size}"
                 onerror="this.outerHTML=initialsAvatar('${employee.first_name}','${employee.last_name}','${size}')">`;
  }
  return initialsAvatar(employee.first_name, employee.last_name, size);
}

function initialsAvatar(firstName, lastName, size = 'md') {
  return `<div class="avatar avatar-${size}">${fmt.initials(firstName, lastName)}</div>`;
}

function assetUrl(url) {
  if (!url) return '';
  if (url === '#') return '#';
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (USE_MOCK_API) return appUrl(url);
  return `http://localhost:5000${url}`;
}

// ─── Build sidebar navigation ───────────────────────────────
function buildSidebar(activePage) {
  const user = api.getUser();
  if (!user) return;

  const isAdmin   = user.role === 'admin';
  const isManager = user.role === 'manager' || isAdmin;

  const navItems = [
    { page: 'dashboard',   icon: gridIcon(),       label: 'Dashboard',    roles: ['admin','manager','employee'] },
    { page: 'announcements', icon: chatIcon(),      label: 'Announcements', roles: ['admin'] },
    { section: 'People Suite', roles: ['admin','manager'] },
    { page: 'hiring',      icon: briefcaseIcon(),  label: 'Hiring',       roles: ['admin','manager'] },
    { page: 'onboarding',  icon: checkIcon(),      label: 'Onboarding',   roles: ['admin','manager'] },
    { page: 'reports',     icon: chartIcon(),      label: 'Reports',      roles: ['admin','manager'] },
    { section: 'Workforce', roles: ['admin','manager','employee'] },
    { page: 'attendance',  icon: clockIcon(),      label: 'Attendance',   roles: ['admin'] },
    { page: 'todos',       icon: checkIcon(),      label: 'To Do List',    roles: ['admin','manager','employee'] },
    { page: 'tickets',     icon: chatIcon(),       label: 'Tickets',       roles: ['admin','manager'] },
    { page: 'leave',       icon: calendarIcon(),   label: 'Leave',        roles: ['admin','manager','employee'] },
    { page: 'payroll',     icon: walletIcon(),     label: 'Payroll',      roles: ['admin','manager','employee'] },
    { page: 'benefits',    icon: docIcon(),        label: 'Benefits',     roles: ['admin','manager'] },
    { page: 'messages',    icon: chatIcon(),       label: 'Messages',     roles: ['admin','manager','employee'] },
    { page: 'documents',   icon: docIcon(),        label: 'Documents',    roles: ['admin','manager','employee'] },
    { page: 'performance', icon: starIcon(),       label: 'Performance',  roles: ['admin','manager','employee'] },
    { section: 'HR Tools', roles: ['admin','manager'] },
    { page: 'employees',   icon: usersIcon(),      label: 'Employees',    roles: ['admin','manager'] },
    { page: 'orgchart',    icon: orgIcon(),        label: 'Org Chart',    roles: ['admin','manager'] },
    { page: 'settings',    icon: settingsIcon(),   label: 'Settings',     roles: ['admin'] },
  ];

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const navHtml = navItems.map(item => {
    if (!item.roles.includes(user.role) && !(item.roles.includes('manager') && isManager)) return '';
    if (!item.roles.includes(user.role)) return '';

    if (item.section) {
      return `<div class="nav-section-label">${item.section}</div>`;
    }
    const active = activePage === item.page ? 'active' : '';
    const href = isAdminWorkspace() ? `#${item.page}` : adminWorkspaceUrl(item.page);
    return `<a href="${href}" class="nav-item ${active}">
      ${item.icon}
      <span>${item.label}</span>
    </a>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-mark">HR</div>
      <span class="logo-text">HR<span>Connect</span></span>
      <button class="sidebar-close-btn" type="button" aria-label="Close menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-user">
      ${user.photo_url
        ? `<img src="${assetUrl(user.photo_url)}" class="user-avatar" alt="">`
        : `<div class="avatar avatar-sm">${fmt.initials(user.first_name, user.last_name)}</div>`
      }
      <div class="user-info">
        <div class="user-name">${user.first_name} ${user.last_name}</div>
        <div class="user-role">${user.role}</div>
      </div>
      <button class="logout-btn" onclick="logout()" title="Logout">
        ${logoutIcon()}
      </button>
    </div>
  `;
  setupMobileSidebar(sidebar);
}

function setupMobileSidebar(sidebar) {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  let button = topbar.querySelector('.mobile-menu-btn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn mobile-menu-btn';
    button.setAttribute('aria-label', 'Open menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
    topbar.insertBefore(button, topbar.firstChild);
  }

  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const closeMenu = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open menu');
  };

  const openMenu = () => {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('sidebar-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Close menu');
  };

  button.onclick = () => sidebar.classList.contains('open') ? closeMenu() : openMenu();
  const closeButton = sidebar.querySelector('.sidebar-close-btn');
  if (closeButton) closeButton.onclick = closeMenu;
  backdrop.onclick = closeMenu;
  sidebar.querySelectorAll('.nav-item').forEach((link) => link.addEventListener('click', closeMenu));

  if (!window.__hrSidebarEscBound) {
    window.__hrSidebarEscBound = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const activeSidebar = document.querySelector('.sidebar.open');
        const activeBackdrop = document.querySelector('.sidebar-backdrop.open');
        activeSidebar?.classList.remove('open');
        activeBackdrop?.classList.remove('open');
        document.body.classList.remove('sidebar-open');
        document.querySelectorAll('.mobile-menu-btn').forEach((btn) => {
          btn.setAttribute('aria-expanded', 'false');
          btn.setAttribute('aria-label', 'Open menu');
        });
      }
    });
  }
}

function logout() {
  api.clearAuth();
  window.location.href = appUrl('/pages/login.html');
}

// ─── Load notification badge ────────────────────────────────
async function loadNotifCount() {
  try {
    bindNotificationButtons();
    const data = await api.get('/notifications/unread-count');
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? '99+' : data.count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (e) { /* silent */ }
}

async function openNotificationsPanel() {
  let panel = document.getElementById('notif-panel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('aside');
  panel.id = 'notif-panel';
  panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-panel-header">
      <h3>Notifications</h3>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" id="notif-read-all">Mark read</button>
        <button class="modal-close" id="notif-close" aria-label="Close notifications">x</button>
      </div>
    </div>
    <div class="notif-list" id="notif-list"><div class="loading-state"><div class="spinner"></div></div></div>
  `;
  document.body.appendChild(panel);
  document.getElementById('notif-close').onclick = () => panel.remove();
  document.getElementById('notif-read-all').onclick = async () => {
    await api.patch('/notifications/read-all');
    await loadNotifCount();
    panel.remove();
    openNotificationsPanel();
  };

  try {
    const rows = await api.get('/notifications/mine');
    const list = document.getElementById('notif-list');
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><p>No notifications yet.</p></div>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <div class="notif-item ${row.is_read ? '' : 'unread'}" onclick="markNotificationRead(${row.id}, '${row.link || ''}')">
        ${row.is_read ? '' : '<span class="notif-dot"></span>'}
        <div>
          <div class="notif-text">${escapeUi(row.message)}</div>
          <div class="notif-time">${fmt.relativeTime(row.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('notif-list').innerHTML = `<div class="empty-state"><p>${escapeUi(e.message || 'Could not load notifications')}</p></div>`;
  }
}

async function markNotificationRead(id, link) {
  try {
    await api.patch(`/notifications/${id}/read`);
    await loadNotifCount();
    if (link && link !== 'null') window.location.href = appUrl(link);
    else {
      document.getElementById('notif-panel')?.remove();
      openNotificationsPanel();
    }
  } catch (e) {
    toast(e.message || 'Could not update notification', 'error');
  }
}

function bindNotificationButtons(root = document) {
  root.querySelectorAll('#notif-btn, .topbar .icon-btn').forEach((button) => {
    if (button.dataset.notifBound) return;
    if (!button.querySelector('#notif-badge, .dot')) return;
    button.dataset.notifBound = '1';
    button.type = button.type || 'button';
    button.addEventListener('click', openNotificationsPanel);
  });
}

function escapeUi(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bindNotificationButtons());
} else {
  bindNotificationButtons();
}

// ─── SVG Icons ──────────────────────────────────────────────
const iconProps = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="nav-icon"`;
const gridIcon     = () => `<svg ${iconProps}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const clockIcon    = () => `<svg ${iconProps}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
const calendarIcon = () => `<svg ${iconProps}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
const walletIcon   = () => `<svg ${iconProps}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 13a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/></svg>`;
const chatIcon     = () => `<svg ${iconProps}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
const docIcon      = () => `<svg ${iconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const starIcon     = () => `<svg ${iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const usersIcon    = () => `<svg ${iconProps}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;
const orgIcon      = () => `<svg ${iconProps}><rect x="8" y="2" width="8" height="6" rx="1"/><rect x="1" y="16" width="8" height="6" rx="1"/><rect x="15" y="16" width="8" height="6" rx="1"/><path d="M12 8v4M12 12H5v4M12 12h7v4"/></svg>`;
const briefcaseIcon = () => `<svg ${iconProps}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18"/></svg>`;
const checkIcon    = () => `<svg ${iconProps}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`;
const heartIcon    = () => `<svg ${iconProps}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>`;
const chartIcon    = () => `<svg ${iconProps}><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/></svg>`;
const settingsIcon = () => `<svg ${iconProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6 1.65 1.65 0 00-.4 1.1V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1 1.65 1.65 0 00-1.1-.4H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-.6 1.65 1.65 0 00.4-1.1V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 00.6 1 1.65 1.65 0 001.1.4H21a2 2 0 010 4h-.09A1.65 1.65 0 0019.4 15z"/></svg>`;
const logoutIcon   = () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
