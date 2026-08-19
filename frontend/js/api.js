// frontend/js/api.js — Centralized API client
// Use the local API while developing and the same origin when deployed.
// A page can opt into the mock API explicitly with `window.__HR_USE_MOCK_API__ = true`.
const API_BASE = window.__HR_API_BASE__ || (
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:5000/api'
    : `${window.location.origin}/api`
);
const USE_MOCK_API = window.__HR_USE_MOCK_API__ === true;
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

function applyCompanyBranding() {
  const user = api.getUser();
  if (!user?.company_id) return;
  try {
    const branding = JSON.parse(localStorage.getItem(`hrconnect.branding.${user.company_id}`) || '{}');
    const root = document.documentElement;
    if (branding.primary_color) {
      root.style.setProperty('--brand', branding.primary_color);
      root.style.setProperty('--accent', branding.primary_color);
      root.style.setProperty('--navy-600', branding.primary_color);
      root.style.setProperty('--navy-700', branding.primary_color);
    }
    if (branding.accent_color) root.style.setProperty('--mint-500', branding.accent_color);
    const primary = branding.primary_color || '#174fae';
    const accent = branding.accent_color || '#73bca7';
    let themeStyle = document.getElementById('company-branding-overrides');
    if (!themeStyle) { themeStyle = document.createElement('style'); themeStyle.id = 'company-branding-overrides'; document.head.appendChild(themeStyle); }
    themeStyle.textContent = `:root{--brand:${primary};--accent:${primary};--navy-600:${primary};--navy-700:${primary};--mint-500:${accent}} .btn-primary,.profile-inline-editor .modal-footer .btn-primary{background:${primary}!important;border-color:${primary}!important}.btn-primary:hover{filter:brightness(.9)}.tab-btn.active,.tabs .active{color:${primary}!important;border-color:${primary}!important}.badge-info{background:color-mix(in srgb,${primary} 12%,white)!important;color:${primary}!important}.profile-hero,.profile-main .profile-hero{background:${primary}!important}.profile-tabs button.active{color:${primary}!important}.profile-grid .card-header h3,.form-section-title{color:${primary}!important}.vital-mark{color:${primary}!important}`;
    document.querySelectorAll('.brand-logo, .staff-brand-logo').forEach((logo) => {
      logo.dataset.defaultSrc ||= logo.src;
      if (!branding.logo_url) { logo.src = logo.dataset.defaultSrc; return; }
      const candidate = new Image();
      candidate.onload = () => { logo.src = branding.logo_url; };
      candidate.onerror = () => { logo.src = logo.dataset.defaultSrc; };
      candidate.src = branding.logo_url;
    });
  } catch (_) {}
}

window.applyCompanyBranding = applyCompanyBranding;

async function refreshCompanyBranding() {
  const user = api.getUser();
  if (!user?.company_id || !api.getToken()) return;
  try {
    const branding = await api.get('/company/branding');
    branding.logo_url = branding.uploaded_logo || branding.logo_url || '';
    localStorage.setItem(`hrconnect.branding.${user.company_id}`, JSON.stringify(branding));
    if (branding.name) {
      document.querySelectorAll('.sidebar-workspace-name').forEach((element) => {
        element.textContent = branding.name;
      });
    }
    applyCompanyBranding();
  } catch (_) {}
}

// Finance receipts require an authenticated request. Open the destination first so browsers
// treat it as a user action, then load the downloaded blob into that tab.
window.setTimeout(() => {
  if (typeof window.viewReceipt !== 'function') return;
  window.viewReceipt = async (id) => {
    const viewer = window.open('', '_blank');
    if (!viewer) {
      toast('Allow pop-ups for this site to open receipt attachments.', 'warning');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/financials/transactions/${id}/receipt`, {
        headers: { Authorization: `Bearer ${api.getToken()}` }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not open receipt');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      viewer.location.replace(objectUrl);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      viewer.close();
      toast(error.message || 'Could not open receipt', 'error');
    }
  };
}, 0);

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
  document.documentElement.classList.add('embedded-page-root');
  document.body.classList.add('embedded-page');
}

// Pages loaded in the workspace iframe include this file at the end of body.
// Apply the embedded layout before their page scripts build their UI, rather than
// waiting for DOMContentLoaded and visibly reflowing a full app shell.
activateEmbeddedWorkspacePage();
if (!document.body && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', activateEmbeddedWorkspacePage);
}

// Let the workspace shell size its frame to the page instead of making each
// module a fixed-height, independently scrolling panel.
if (isEmbeddedWorkspacePage()) {
  let embeddedHeightFrame = 0;
  let embeddedResizeObserver;
  const publishEmbeddedHeight = () => {
    cancelAnimationFrame(embeddedHeightFrame);
    embeddedHeightFrame = requestAnimationFrame(() => {
      // Do not measure documentElement.scrollHeight here. Once the parent makes
      // the iframe taller, that value can become the iframe viewport height and
      // be reported back as new content height forever. Measure the real module
      // instead, which lets the outer workspace own the only page scroll.
      const content = document.querySelector('main.main-content');
      const contentHeight = content
        ? Math.max(1, Math.ceil(content.offsetTop + content.scrollHeight))
        : Math.max(1, Math.ceil(document.body?.scrollHeight || 1));
      const openModal = Array.from(document.querySelectorAll('.modal-overlay')).find((overlay) => getComputedStyle(overlay).display !== 'none');
      const modalHeight = openModal?.querySelector('.modal')?.scrollHeight || 0;
      const height = Math.max(contentHeight, modalHeight ? Math.ceil(modalHeight + 80) : 0);
      window.parent.postMessage({ type: 'hrconnect:page-height', height }, window.location.origin);
    });
  };
  window.addEventListener('load', publishEmbeddedHeight);
  document.addEventListener('DOMContentLoaded', () => {
    const content = document.querySelector('main.main-content') || document.body;
    embeddedResizeObserver = new ResizeObserver(publishEmbeddedHeight);
    embeddedResizeObserver.observe(content);
    // Lists such as Messages and To do render after their API calls. A mutation
    // observer republishes their real height even when their outer box keeps
    // the same computed size during that render.
    new MutationObserver(publishEmbeddedHeight).observe(content, { childList: true, subtree: true });
    publishEmbeddedHeight();
  });
  window.addEventListener('hrconnect:request-page-height', publishEmbeddedHeight);
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
      window.location.href = appUrl('/pages/login.html');
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

let pushRegistrationPromise = null;

function pushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function addWebAppManifest() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = appUrl('/manifest.webmanifest');
  document.head.appendChild(manifest);
}

function addBrandIcon() {
  if (document.querySelector('link[rel="icon"]')) return;
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/jpeg';
  icon.href = appUrl('/assets/title_icon.jpg');
  document.head.appendChild(icon);
}

async function registerPushWorker() {
  if (!pushSupported()) return null;
  if (!pushRegistrationPromise) {
    pushRegistrationPromise = navigator.serviceWorker.register(appUrl('/push-sw.js'), { scope: appUrl('/') })
      .then((registration) => {
        registration.update().catch(() => {});
        return registration;
      })
      .catch(() => null);
  }
  return pushRegistrationPromise;
}

function vapidKeyBytes(publicKey) {
  const normalized = `${publicKey}${'='.repeat((4 - publicKey.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const value = atob(normalized);
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

async function getPushStatus() {
  if (!api.getToken() || !pushSupported()) return { configured: false, supported: pushSupported(), subscribed: false };
  const status = await api.get('/push/status');
  return { ...status, supported: true };
}

async function enableDeviceAlerts() {
  try {
    const status = await getPushStatus();
    if (!status.supported) throw new Error('This browser does not support device alerts. Use the latest Chrome, Edge, Firefox, or an installed KenadHR app.');
    if (!status.configured || !status.publicKey) throw new Error('Device alerts are not configured yet. Please try again shortly.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to receive device alerts.');
    const registration = await registerPushWorker();
    if (!registration) throw new Error('Could not prepare device alerts in this browser.');
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(status.publicKey) });
    await api.post('/push/subscribe', subscription.toJSON());
    await renderPushControl();
    toast('Device alerts are on. You will receive notification sounds for KenadHR updates.', 'success');
  } catch (error) {
    toast(error.message || 'Could not enable device alerts', 'error');
  }
}

async function testDeviceAlerts() {
  try {
    await api.post('/push/test', {});
    toast('Test alert sent. It may appear in your device notification tray.', 'success');
  } catch (error) {
    toast(error.message || 'Could not send a test alert', 'error');
  }
}

async function renderPushControl() {
  const statusLabel = document.getElementById('push-status-label');
  const enableButton = document.getElementById('push-enable-button');
  const testButton = document.getElementById('push-test-button');
  if (!statusLabel || !enableButton || !testButton) return;
  try {
    const status = await getPushStatus();
    if (!status.supported) {
      statusLabel.textContent = 'Not supported in this browser';
      enableButton.hidden = true;
      testButton.hidden = true;
      return;
    }
    if (!status.configured) {
      statusLabel.textContent = 'Coming online';
      enableButton.hidden = true;
      testButton.hidden = true;
      return;
    }
    if (status.subscribed && Notification.permission === 'granted') {
      statusLabel.textContent = 'On for this device';
      enableButton.hidden = true;
      testButton.hidden = false;
      return;
    }
    statusLabel.textContent = Notification.permission === 'denied' ? 'Blocked in browser settings' : 'Off for this device';
    enableButton.hidden = false;
    testButton.hidden = true;
  } catch (_) {
    statusLabel.textContent = 'Unavailable';
  }
}

window.enableDeviceAlerts = enableDeviceAlerts;
window.testDeviceAlerts = testDeviceAlerts;

function requestAttendanceLocation() {
  if (!window.isSecureContext || !navigator.geolocation) {
    return Promise.reject(new Error('Location requires HTTPS and a browser that supports device location.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: Number(coords.latitude.toFixed(6)),
        longitude: Number(coords.longitude.toFixed(6)),
        accuracy_meters: Math.round(coords.accuracy)
      }),
      (error) => {
        const messages = { 1: 'Location permission was denied. Allow precise location to clock in or out.', 2: 'Your location could not be determined. Check GPS or network signal and try again.', 3: 'Location request timed out. Please try again.' };
        reject(new Error(messages[error.code] || 'Could not get your location.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

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
    window.location.href = appUrl('/pages/login.html');
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
  if (type === 'success') {
    document.getElementById('success-popup')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'success-popup';
    overlay.className = 'success-popup-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'success-popup-title');
    overlay.innerHTML = `<div class="success-popup-card"><div class="success-popup-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></div><h3 id="success-popup-title">Success!</h3><p></p><button class="btn success-popup-dismiss" type="button">Dismiss</button></div>`;
    overlay.querySelector('p').textContent = String(message || 'Your changes have been saved.');
    const close = () => overlay.remove();
    overlay.querySelector('.success-popup-dismiss').addEventListener('click', close);
    document.body.appendChild(overlay);
    overlay.querySelector('.success-popup-dismiss').focus();
    return;
  }

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
function companyPreferences() {
  try {
    const user = api?.getUser?.();
    return JSON.parse(localStorage.getItem(`hrconnect.company-preferences.${user?.company_id || 'default'}`) || '{}');
  } catch (_) { return {}; }
}

const fmt = {
  date(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(companyPreferences().locale || 'en-GB', { day:'2-digit', month:'short', year:'numeric' });
  },
  time(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  },
  datetime(d) {
    if (!d) return '—';
    return `${fmt.date(d)} ${fmt.time(d)}`;
  },
  currency(n, currency) {
    if (n == null) return '—';
    const preferences = companyPreferences();
    return new Intl.NumberFormat(preferences.locale || 'en-GB', { style:'currency', currency: currency || preferences.currency || 'USD' }).format(n);
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
                 alt="${escapeAvatarText(employee.first_name)}"
                 class="avatar avatar-${size}"
                 data-first-name="${escapeAvatarText(employee.first_name)}"
                 data-last-name="${escapeAvatarText(employee.last_name)}"
                 onerror="replaceAvatarWithInitials(this)">`;
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
  // API_BASE is same-origin on Railway and localhost only during development.
  // Uploaded files live beside the API, not beneath its /api route.
  const assetBase = API_BASE.replace(/\/api\/?$/, '');
  return `${assetBase}${url.startsWith('/') ? url : `/${url}`}`;
}

async function openDocument(id) {
  let viewer = null;
  try {
    viewer = window.open('', '_blank');
    if (viewer) viewer.document.title = 'Opening document…';
    const response = await fetch(`${API_BASE}/documents/${id}/view`, {
      headers: { Authorization: `Bearer ${api.getToken()}` }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Could not open document');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    if (viewer) {
      viewer.location.replace(objectUrl);
    } else {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    viewer?.close();
    toast(error.message || 'Could not open document', 'error');
  }
}

window.openDocument = openDocument;

function escapeAvatarText(value) {
  return String(value || '').replace(/[&<>\"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[char]);
}

function replaceAvatarWithInitials(image) {
  const fallback = document.createElement('div');
  fallback.className = image.className || 'avatar avatar-md';
  fallback.textContent = fmt.initials(image.dataset.firstName, image.dataset.lastName) || '?';
  image.replaceWith(fallback);
}

// ─── Build sidebar navigation ───────────────────────────────
function buildSidebar(activePage, options = {}) {
  const user = api.getUser();
  if (!user) return;

  // The workspace parent owns the visible shell for iframe pages. Building a
  // second sidebar/topbar here only creates hidden work and can reintroduce a
  // layout shift while a child route is loading.
  if (isEmbeddedWorkspacePage()) {
    applyCompanyBranding();
    return;
  }

  const isAdmin   = user.role === 'admin';
  const isManager = user.role === 'manager' || isAdmin;
  const isWorkspaceStatic = options.presentation === 'workspace-static';

  const employeeNavItems = [
    { page: 'dashboard',   icon: gridIcon(),       label: 'Dashboard',    roles: ['admin','manager','employee'] },
    { section: 'My Workspace', icon: gridIcon(), roles: ['employee'] },
    { page: 'announcements', icon: chatIcon(),      label: 'Announcements', roles: ['admin','employee'] },
    { page: 'profile',     icon: usersIcon(),      label: 'Profile',      roles: ['employee'] },
    { page: 'messages',    icon: chatIcon(),       label: 'Messages',     roles: ['admin','manager','employee'] },
    { section: 'Workforce', icon: usersIcon(), roles: ['admin','manager','employee'] },
    { page: 'attendance',  icon: clockIcon(),      label: 'Attendance',   roles: ['admin','employee'] },
    { page: 'internal-jobs', icon: briefcaseIcon(), label: 'Internal Jobs', roles: ['employee'] },
    { page: 'todos',       icon: checkIcon(),      label: 'To Do List',    roles: ['admin','manager','employee'] },
    { page: 'leave',       icon: calendarIcon(),   label: 'Leave',        roles: ['admin','manager','employee'] },
    { page: 'calendar',    icon: calendarIcon(),   label: 'Calendar',     roles: ['admin','manager','employee'] },
    { page: 'payroll',     icon: walletIcon(),     label: 'Payroll',      roles: ['admin','manager','employee'] },
    { page: 'benefits',    icon: docIcon(),        label: 'Benefits',     roles: ['admin','manager','employee'] },
    { page: 'documents',   icon: docIcon(),        label: 'Documents',    roles: ['admin','manager','employee'] },
    { page: 'performance', icon: starIcon(),       label: 'Performance',  roles: ['admin','manager','employee'] },
    { page: 'training',    icon: checkIcon(),      label: 'Training Register', roles: ['admin','manager','employee'] },
    { page: 'probation',   icon: clockIcon(),      label: 'Probation Tracker', roles: ['admin','manager','employee'] },
    { page: 'contracts',   icon: docIcon(),        label: 'Contract Expiry', roles: ['admin','manager','employee'] },
    { page: 'orgchart',    icon: orgIcon(),        label: 'Org Chart',    roles: ['admin','manager','employee'] },
    { page: 'settings',    icon: settingsIcon(),   label: 'Settings',     roles: ['admin','employee'] },
  ];
  const managementNavItems = [
    { page: 'dashboard', icon: gridIcon(), label: 'Dashboard', roles: ['admin', 'manager'] },
    { page: 'announcements', icon: chatIcon(), label: 'Announcements', roles: ['admin'] },
    { section: 'People', icon: usersIcon(), roles: ['admin', 'manager'] },
    { page: 'employees', icon: usersIcon(), label: 'Employees', roles: ['admin', 'manager'] },
    { page: 'departments', icon: orgIcon(), label: 'Departments', roles: ['admin', 'manager'] },
    { page: 'orgchart', icon: orgIcon(), label: 'Organization Chart', roles: ['admin', 'manager'] },
    { page: 'recruitment', icon: briefcaseIcon(), label: 'Recruitment', roles: ['admin', 'manager'], standalone: true },
    { page: 'onboarding', icon: checkIcon(), label: 'Onboarding', roles: ['admin', 'manager'], standalone: true },
    { section: 'Work', icon: calendarIcon(), roles: ['admin', 'manager'] },
    { page: 'attendance', icon: clockIcon(), label: 'Attendance', roles: ['admin', 'manager'] },
    { page: 'leave', icon: calendarIcon(), label: 'Leave Management', roles: ['admin', 'manager'] },
    { page: 'calendar', icon: calendarIcon(), label: 'Company Calendar', roles: ['admin', 'manager'] },
    { page: 'todos', icon: checkIcon(), label: 'To Do List', roles: ['admin', 'manager'] },
    { page: 'messages', icon: chatIcon(), label: 'Messages', roles: ['admin', 'manager'] },
    { section: 'Pay & Benefits', icon: walletIcon(), roles: ['admin', 'manager'] },
    { page: 'payroll', icon: walletIcon(), label: 'Payroll', roles: ['admin', 'manager'] },
    { page: 'benefits', icon: docIcon(), label: 'Benefits', roles: ['admin', 'manager'] },
    { page: 'loans', icon: walletIcon(), label: 'Employee Loans', roles: ['admin', 'manager'] },
    { section: 'Records', icon: docIcon(), roles: ['admin', 'manager'] },
    { page: 'documents', icon: docIcon(), label: 'Documents', roles: ['admin', 'manager'] },
    { page: 'performance', icon: starIcon(), label: 'Performance Review', roles: ['admin', 'manager'] },
    { page: 'assets', icon: docIcon(), label: 'Company Assets', roles: ['admin', 'manager'] },
    { page: 'financials', icon: walletIcon(), label: 'Expenses', roles: ['admin', 'manager'] },
    { section: 'Administration', icon: briefcaseIcon(), roles: ['admin', 'manager'] },
    { page: 'audit', icon: docIcon(), label: 'Audit History', roles: ['admin'] },
    { page: 'settings', icon: settingsIcon(), label: 'Settings', roles: ['admin'], standalone: true },
  ];
  const workspaceNavItems = [
    { page: 'dashboard', icon: gridIcon(), label: 'Dashboard', roles: ['admin', 'manager'] },
    { page: 'announcements', icon: chatIcon(), label: 'Announcements', roles: ['admin'] },
    { section: 'People', icon: usersIcon(), roles: ['admin', 'manager'] },
    { page: 'employees', icon: usersIcon(), label: 'Employees', roles: ['admin', 'manager'], activeFor: ['employee-profile', 'people'] },
    { page: 'departments', icon: orgIcon(), label: 'Departments', roles: ['admin', 'manager'] },
    { page: 'orgchart', icon: orgIcon(), label: 'Organization chart', roles: ['admin', 'manager'] },
    { page: 'onboarding', icon: checkIcon(), label: 'Onboarding', roles: ['admin', 'manager'] },
    { section: 'Recruitment', icon: briefcaseIcon(), roles: ['admin', 'manager'] },
    { page: 'recruitment-requests', icon: docIcon(), label: 'Recruitment requests', roles: ['admin', 'manager'], activeFor: ['recruitment', 'hiring', 'recruitment-request-form'] },
    { page: 'recruitment-requisitions', icon: briefcaseIcon(), label: 'Job requisitions', roles: ['admin', 'manager'], activeFor: ['recruitment-form'] },
    { page: 'recruitment-postings', icon: chatIcon(), label: 'Job postings', roles: ['admin', 'manager'], activeFor: ['recruitment-posting-form'] },
    { page: 'applications', icon: usersIcon(), label: 'Applications', roles: ['admin', 'manager'], activeFor: ['candidate', 'recruitment-candidates'] },
    { page: 'recruitment-pipeline', icon: gridIcon(), label: 'Recruitment pipeline', roles: ['admin', 'manager'] },
    { page: 'recruitment-interviews', icon: calendarIcon(), label: 'Interviews', roles: ['admin', 'manager'], activeFor: ['recruitment-interview-form'] },
    { page: 'recruitment-offers', icon: docIcon(), label: 'Job offers', roles: ['admin', 'manager'], activeFor: ['recruitment-offer-form'] },
    { page: 'recruitment-settings', icon: settingsIcon(), label: 'Configuration', roles: ['admin', 'manager'] },
    { section: 'Work', icon: calendarIcon(), roles: ['admin', 'manager'] },
    { page: 'attendance', icon: clockIcon(), label: 'Attendance', roles: ['admin', 'manager'], activeFor: ['work'] },
    { page: 'leave', icon: calendarIcon(), label: 'Leave management', roles: ['admin', 'manager'] },
    { page: 'calendar', icon: calendarIcon(), label: 'Company calendar', roles: ['admin', 'manager'] },
    { page: 'todos', icon: checkIcon(), label: 'To do list', roles: ['admin', 'manager'] },
    { page: 'messages', icon: chatIcon(), label: 'Messages', roles: ['admin', 'manager'] },
    { page: 'tickets', icon: docIcon(), label: 'Tickets', roles: ['admin', 'manager'] },
    { section: 'Pay & Benefits', icon: walletIcon(), roles: ['admin', 'manager'] },
    { page: 'payroll', icon: walletIcon(), label: 'Payroll', roles: ['admin', 'manager'], activeFor: ['finance'] },
    { page: 'benefits', icon: docIcon(), label: 'Benefits', roles: ['admin', 'manager'] },
    { page: 'loans', icon: walletIcon(), label: 'Employee loans', roles: ['admin', 'manager'] },
    { page: 'financials', icon: walletIcon(), label: 'Financials', roles: ['admin', 'manager'] },
    { section: 'Growth & Records', icon: docIcon(), roles: ['admin', 'manager'] },
    { page: 'documents', icon: docIcon(), label: 'Documents', roles: ['admin', 'manager'], activeFor: ['records'] },
    { page: 'performance', icon: starIcon(), label: 'Performance reviews', roles: ['admin', 'manager'] },
    { page: 'training', icon: checkIcon(), label: 'Training register', roles: ['admin', 'manager'] },
    { page: 'probation', icon: clockIcon(), label: 'Probation tracker', roles: ['admin', 'manager'] },
    { page: 'contracts', icon: docIcon(), label: 'Contract expiry', roles: ['admin', 'manager'] },
    { page: 'assets', icon: docIcon(), label: 'Company assets', roles: ['admin', 'manager'] },
    { page: 'disciplinary', icon: docIcon(), label: 'Disciplinary register', roles: ['admin', 'manager'] },
    { page: 'operations', icon: gridIcon(), label: 'Operations registers', roles: ['admin', 'manager'] },
    { section: 'Administration', icon: settingsIcon(), roles: ['admin', 'manager'] },
    { page: 'audit', icon: docIcon(), label: 'Audit history', roles: ['admin'] },
    { page: 'settings', icon: settingsIcon(), label: 'Settings', roles: ['admin'] },
  ];
  const navItems = isWorkspaceStatic
    ? (user.role === 'employee' ? employeeNavItems.filter(item => item.page) : workspaceNavItems)
    : (user.role === 'employee' ? employeeNavItems : managementNavItems);

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const previousNav = sidebar.querySelector('.sidebar-nav');
  const previousScrollTop = previousNav ? previousNav.scrollTop : getSidebarScrollTop();

  const visibleNavItems = navItems.filter(item =>
    item.roles.includes(user.role) || (item.roles.includes('manager') && isManager)
  );
  let currentGroup = null;
  let navHtml = '';
  visibleNavItems.forEach(item => {
    if (item.standalone && currentGroup) {
      navHtml += '</div></div></div>';
      currentGroup = null;
    }
    if (item.section) {
      if (currentGroup) navHtml += '</div></div></div>';
      currentGroup = item.section.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      navHtml += `<div class="nav-group" data-nav-group="${currentGroup}">
        <button class="nav-group-toggle" type="button" aria-expanded="false">
          <span class="nav-group-heading">${item.icon}<span>${item.section}</span></span>
          <svg class="nav-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="nav-group-items"><div class="nav-group-items-inner">`;
      return;
    }
    const activeFor = [item.page, ...(item.activeFor || [])];
    const active = activeFor.includes(activePage) ? 'active' : '';
    const staffRoutes = {
      dashboard: 'overview', announcements: 'announcements', profile: 'profile', attendance: 'attendance',
      todos: 'todos', tickets: 'tickets', leave: 'leave', payroll: 'payroll',
      documents: 'documents', performance: 'performance', orgchart: 'orgchart', settings: 'settings'
    };
    const isStandaloneHrSettings = user.role !== 'employee' && item.page === 'settings' && !isAdminWorkspace();
    const href = isStandaloneHrSettings
      ? appUrl('/pages/settings.html')
      : user.role === 'employee'
      ? (item.page === 'internal-jobs'
        ? appUrl('/pages/internal-jobs.html')
        : item.page === 'messages'
        ? appUrl('/pages/messages.html')
        : item.page === 'calendar'
          ? appUrl('/pages/calendar.html')
          : item.page === 'benefits'
            ? appUrl('/pages/benefits.html')
            : item.page === 'loans'
              ? appUrl('/pages/loans.html')
              : item.page === 'training'
                ? appUrl('/pages/training.html')
                : item.page === 'probation'
                  ? appUrl('/pages/probation.html')
                  : item.page === 'contracts'
                    ? appUrl('/pages/contracts.html')
        : appUrl(`/pages/staff-portal.html#${staffRoutes[item.page] || 'overview'}`))
      : (isAdminWorkspace() ? `#${item.page}` : adminWorkspaceUrl(item.page));
    const groupClass = currentGroup ? ' nav-item-child' : '';
    navHtml += `<a href="${href}" class="nav-item ${active}${groupClass}" data-nav-page="${item.page}" data-nav-active-for="${activeFor.join(' ')}"${active ? ' aria-current="page"' : ''}${currentGroup ? ` data-nav-parent="${currentGroup}"` : ''}>
      ${item.icon}
      <span>${item.label}</span>
      ${item.page === 'announcements' ? '<span class="nav-badge hidden" data-announcement-nav-badge>0</span>' : ''}
      ${item.page === 'messages' ? '<span class="nav-badge hidden" data-message-nav-badge>0</span>' : ''}
    </a>`;
  });
  if (currentGroup) navHtml += '</div></div></div>';

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <img class="brand-logo" src="${appUrl('/assets/logo-transparent.png?v=1')}" alt="KenadHR">
      <span class="sidebar-workspace-name">${escapeAvatarText(user.company_name || 'KenadHR Workspace')}</span>
      <svg class="sidebar-workspace-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      <button class="sidebar-close-btn" type="button" aria-label="Close menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-user">
      ${user.photo_url
        ? avatarEl(user, 'sm').replace('class="avatar avatar-sm"', 'class="user-avatar"')
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
  // Workspace navigation uses the same expandable menu behavior as the rest
  // of the app. Do not attach the legacy static-sidebar class: it forces all
  // submenu lists open and hides their controls.
  sidebar.classList.remove('sidebar--workspace-static');
  applyCompanyBranding();
  refreshCompanyBranding();
  addPageBackButton(activePage);
  setupQuickAccess(navItems, user, isManager);
  setupSidebarGroups(sidebar, activePage, user);
  setupSidebarScrollMemory(sidebar, previousScrollTop);
  setupMobileSidebar(sidebar);
  loadMessageNavCount();
  loadAnnouncementNavCount();
}

function setSidebarActive(activePage) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return false;
  const requestedPage = String(activePage || '').trim();
  let hasActiveItem = false;

  sidebar.querySelectorAll('[data-nav-page]').forEach((link) => {
    const pages = String(link.dataset.navActiveFor || link.dataset.navPage || '')
      .split(/\s+/)
      .filter(Boolean);
    const isActive = pages.includes(requestedPage);
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
      hasActiveItem = true;
    } else {
      link.removeAttribute('aria-current');
    }
  });

  // Workspace routes change without rebuilding the sidebar. Keep the selected
  // item's parent menu open so the active page never disappears into a closed
  // submenu after navigation.
  const activeLink = sidebar.querySelector('.nav-item.active[data-nav-parent]');
  if (activeLink) {
    sidebar.querySelectorAll('.nav-group').forEach((candidate) => {
      const isActiveParent = candidate.dataset.navGroup === activeLink.dataset.navParent;
      candidate.classList.toggle('is-open', isActiveParent);
      candidate.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded', String(isActiveParent));
    });
    const group = sidebar.querySelector(`.nav-group[data-nav-group="${activeLink.dataset.navParent}"]`);
    const toggle = group?.querySelector('.nav-group-toggle');
    group?.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
  }

  return hasActiveItem;
}

window.setSidebarActive = setSidebarActive;

function setupQuickAccess(navItems, user, isManager) {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  if (topbar.dataset.staticNav === 'true') return;
  const existingQuickAccess = topbar.querySelector('.quick-access');
  if (existingQuickAccess) {
    const input = existingQuickAccess.querySelector('.quick-access-input');
    const results = existingQuickAccess.querySelector('.quick-access-results');
    if (input) input.value = '';
    if (input) input.setAttribute('aria-expanded', 'false');
    if (results) {
      results.hidden = true;
      results.innerHTML = '';
    }
    return;
  }

  const staffRoutes = {
    dashboard: 'overview', announcements: 'announcements', profile: 'profile', attendance: 'attendance',
    todos: 'todos', tickets: 'tickets', leave: 'leave', payroll: 'payroll', documents: 'documents',
    performance: 'performance', orgchart: 'orgchart', settings: 'settings'
  };
  const destinations = navItems
    .filter(item => item.page && item.roles.includes(user.role) && (item.roles.includes(user.role) || (item.roles.includes('manager') && isManager)))
    .map(item => ({
      label: item.label,
      href: user.role === 'employee'
        ? (item.page === 'internal-jobs' ? appUrl('/pages/internal-jobs.html')
          : item.page === 'messages' ? appUrl('/pages/messages.html')
          : item.page === 'calendar' ? appUrl('/pages/calendar.html')
            : item.page === 'benefits' ? appUrl('/pages/benefits.html')
              : item.page === 'training' ? appUrl('/pages/training.html')
                : item.page === 'probation' ? appUrl('/pages/probation.html')
                  : item.page === 'contracts' ? appUrl('/pages/contracts.html')
                    : appUrl(`/pages/staff-portal.html#${staffRoutes[item.page] || 'overview'}`))
        : adminWorkspaceUrl(item.page)
    }));
  const adminDestinations = [
    ['Attendance', 'attendance'], ['Leave Management', 'leave'], ['Company Calendar', 'calendar'],
    ['Payroll', 'payroll'], ['Financials', 'financials'], ['Audit History', 'audit'],
    ['Company Assets', 'assets'], ['Benefits', 'benefits'], ['Employee Loans', 'loans'],
    ['To Do List', 'todos'], ['Messages', 'messages'],
    ['Documents', 'documents'], ['Performance Reviews', 'performance'], ['Training Register', 'training'],
    ['Probation Tracker', 'probation'], ['Disciplinary Register', 'disciplinary'],
    ['Contract Expiry Tracker', 'contracts'], ['Recruitment', 'recruitment'], ['Onboarding', 'onboarding'],
    ['Organization Chart', 'orgchart']
  ];
  if (user.role === 'admin') {
    adminDestinations.forEach(([label, page]) => {
      if (!destinations.some(item => item.href === adminWorkspaceUrl(page))) {
        destinations.push({ label, href: adminWorkspaceUrl(page) });
      }
    });
  }

  const quickAccess = document.createElement('div');
  quickAccess.className = 'quick-access';
  quickAccess.innerHTML = `
    <svg class="quick-access-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg>
    <input class="quick-access-input" type="search" autocomplete="off" placeholder="Quick access…" aria-label="Quick access search" aria-expanded="false">
    <kbd>Ctrl K</kbd>
    <div class="quick-access-results" role="listbox" hidden></div>`;
  const actions = topbar.querySelector('.topbar-actions');
  topbar.insertBefore(quickAccess, actions || null);

  const input = quickAccess.querySelector('.quick-access-input');
  const results = quickAccess.querySelector('.quick-access-results');
  const render = () => {
    const term = input.value.trim().toLowerCase();
    const matches = destinations.filter(item => item.label.toLowerCase().includes(term));
    results.hidden = !term;
    input.setAttribute('aria-expanded', String(Boolean(term)));
    results.innerHTML = matches.length
      ? matches.map(item => `<a role="option" href="${item.href}"><span>${item.label}</span><small>Open</small></a>`).join('')
      : '<div class="quick-access-empty">No matching pages</div>';
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  results.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    input.value = '';
    results.hidden = true;
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { input.value = ''; render(); input.blur(); }
    if (event.key === 'Enter') {
      const first = results.querySelector('a');
      if (first) first.click();
    }
  });
  document.addEventListener('click', event => {
    if (!quickAccess.contains(event.target)) { input.value = ''; render(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
    }
  });
}

const SIDEBAR_SCROLL_KEY = 'hrconnect.sidebar.scrollTop';

function addPageBackButton(activePage) {
  if (activePage === 'dashboard' || document.querySelector('[data-page-back-button]')) return;
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  if (topbar.dataset.staticNav === 'true') return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-outline btn-sm';
  button.dataset.pageBackButton = 'true';
  button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg><span>Back</span>';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.gap = '6px';
  button.setAttribute('aria-label', 'Go back to the previous page');
  button.onclick = () => {
    const targetWindow = window.top !== window.self ? window.top : window;
    if (targetWindow.history.length > 1) {
      targetWindow.history.back();
      return;
    }
    const currentUser = api.getUser();
    const fallback = currentUser?.role === 'employee'
      ? appUrl('/pages/staff-portal.html#overview')
      : adminWorkspaceUrl('dashboard');
    if (window.top !== window.self) window.top.location.assign(fallback);
    else window.location.assign(fallback);
  };
  const actions = topbar.querySelector('.topbar-actions');
  topbar.insertBefore(button, actions || null);
}

function getSidebarScrollTop() {
  try {
    return Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
  } catch (err) {
    return 0;
  }
}

function setSidebarScrollTop(value) {
  try {
    sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(Math.max(0, Math.round(value || 0))));
  } catch (err) {}
}

function setupSidebarGroups(sidebar, activePage, user) {
  sidebar.querySelectorAll('.nav-group').forEach(group => {
    const toggle = group.querySelector('.nav-group-toggle');
    const containsActivePage = Boolean(group.querySelector('.nav-item.active'));
    const isOpen = containsActivePage;
    group.classList.toggle('is-open', isOpen);
    toggle?.setAttribute('aria-expanded', String(isOpen));

    toggle?.addEventListener('click', () => {
      const nextOpen = !group.classList.contains('is-open');
      sidebar.querySelectorAll('.nav-group').forEach((candidate) => {
        candidate.classList.toggle('is-open', candidate === group && nextOpen);
        candidate.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded', String(candidate === group && nextOpen));
      });
    });
  });
}

function setupSidebarScrollMemory(sidebar, scrollTop) {
  const nav = sidebar.querySelector('.sidebar-nav');
  if (!nav) return;

  const restore = () => {
    const maxScroll = Math.max(0, nav.scrollHeight - nav.clientHeight);
    nav.scrollTop = Math.min(Math.max(0, scrollTop || 0), maxScroll);
  };

  restore();
  requestAnimationFrame(restore);

  nav.addEventListener('scroll', () => setSidebarScrollTop(nav.scrollTop), { passive: true });
  nav.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('click', () => setSidebarScrollTop(nav.scrollTop));
  });
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

  if (button.dataset.staffMenuControl !== 'true') {
    button.onclick = () => sidebar.classList.contains('open') ? closeMenu() : openMenu();
  }
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

function setMessageNavBadge(count) {
  const total = Number(count) || 0;
  document.querySelectorAll('[data-message-nav-badge]').forEach((badge) => {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('hidden', total === 0);
  });
}

function setAnnouncementNavBadge(count) {
  const total = Number(count) || 0;
  document.querySelectorAll('[data-announcement-nav-badge]').forEach((badge) => {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('hidden', total === 0);
  });
}

async function loadAnnouncementNavCount() {
  try {
    const rows = await getNotifications();
    setAnnouncementNavBadge(rows.filter((notification) => notification.type === 'announcement' && !notification.is_read).length);
  } catch (error) {
    // The menu should still work if announcement counts are temporarily unavailable.
  }
}

async function loadMessageNavCount() {
  try {
    const data = await api.get('/messages/unread-count');
    setMessageNavBadge(data.count);
  } catch (error) {
    // The menu should still work if message counts are temporarily unavailable.
  }
}

// ─── Load notification badge ────────────────────────────────
let notificationsCache = null;
let notificationsRequest = null;

async function getNotifications({ refresh = false } = {}) {
  if (!refresh && notificationsCache) return notificationsCache;
  if (!notificationsRequest) {
    notificationsRequest = api.get('/notifications/mine')
      .then((rows) => {
        notificationsCache = rows;
        return rows;
      })
      .finally(() => { notificationsRequest = null; });
  }
  return notificationsRequest;
}

function warmNotificationsCache() {
  if (!notificationsCache && !notificationsRequest) getNotifications().catch(() => {});
}

function replaceNotificationsCache(rows) {
  notificationsCache = Array.isArray(rows) ? rows.slice() : [];
  notificationsRequest = null;
}

window.replaceNotificationsCache = replaceNotificationsCache;

async function loadNotifCount() {
  if (isEmbeddedWorkspacePage()) return;
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
    warmNotificationsCache();
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
      <div><h3>Notifications</h3><p id="notif-summary">Loading updates…</p></div>
      <button class="modal-close" id="notif-close" type="button" aria-label="Close notifications">×</button>
    </div>
    <div class="notif-panel-actions">
      <button class="btn btn-outline btn-sm" id="notif-read-all" type="button">Read all</button>
      <button class="btn btn-danger btn-sm" id="notif-clear-all" type="button">Clear all</button>
    </div>
    <div class="push-alert-control">
      <div><strong>Device alerts</strong><span id="push-status-label">Checking…</span></div>
      <div class="push-alert-actions">
        <button class="btn btn-outline btn-sm" id="push-enable-button" type="button" onclick="enableDeviceAlerts()">Enable alerts</button>
        <button class="btn btn-outline btn-sm" id="push-test-button" type="button" onclick="testDeviceAlerts()" hidden>Test</button>
      </div>
    </div>
    <div class="notif-list" id="notif-list"><div class="loading-state"><div class="spinner"></div></div></div>
  `;
  document.body.appendChild(panel);
  renderPushControl();
  document.getElementById('notif-close').onclick = () => panel.remove();
  document.getElementById('notif-read-all').onclick = () => markAllNotificationsRead(panel);
  document.getElementById('notif-clear-all').onclick = () => clearAllNotifications(panel);
  await renderNotifications(panel);
}

window.openNotificationsPanel = openNotificationsPanel;

function notificationMeta(type) {
  const meta = {
    message: ['Message', '✉'], announcement: ['Announcement', '📣'], leave_request: ['Leave request', '◷'],
    leave_approved: ['Leave approved', '✓'], leave_rejected: ['Leave update', '!'], payroll: ['Payroll', '₵'],
    review: ['Performance review', '★'], it_ticket: ['IT ticket', '⌁'], welcome: ['Welcome', '✦']
  };
  return meta[type] || ['KenadHR update', '•'];
}

function notificationLink(row) {
  if (row.link) return row.link;
  const defaults = {
    welcome: '/pages/staff-portal.html#overview', message: '/pages/messages.html', payroll: '/pages/staff-portal.html#payroll',
    review: '/pages/staff-portal.html#performance', leave_approved: '/pages/staff-portal.html#leave',
    leave_rejected: '/pages/staff-portal.html#leave', it_ticket: '/pages/staff-portal.html#tickets'
  };
  return defaults[row.type] || '/pages/staff-portal.html#overview';
}

async function renderNotifications(panel = document.getElementById('notif-panel')) {
  try {
    const rows = await getNotifications();
    if (!panel?.isConnected) return;
    const list = panel.querySelector('#notif-list');
    const unread = rows.filter((row) => !row.is_read).length;
    panel.querySelector('#notif-summary').textContent = unread ? `${unread} unread update${unread === 1 ? '' : 's'}` : (rows.length ? 'You’re all caught up' : 'No updates yet');
    panel.querySelector('#notif-read-all').disabled = unread === 0;
    panel.querySelector('#notif-clear-all').disabled = rows.length === 0;
    if (!rows.length) {
      list.innerHTML = '<div class="notif-empty"><div>✓</div><strong>All caught up</strong><p>New KenadHR updates will appear here.</p></div>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <button class="notif-item ${row.is_read ? '' : 'unread'}" type="button" data-notification-id="${row.id}" aria-label="Open ${escapeUi(notificationMeta(row.type)[0])}">
        <span class="notif-type-icon notif-${escapeUi(row.type || 'general')}">${notificationMeta(row.type)[1]}</span>
        <span class="notif-content">
          <span class="notif-item-top"><span class="notif-label">${escapeUi(notificationMeta(row.type)[0])}</span>${row.is_read ? '' : '<span class="notif-new">New</span>'}</span>
          <span class="notif-text">${escapeUi(row.message)}</span>
          <span class="notif-time">${fmt.relativeTime(row.created_at)} <span aria-hidden="true">→</span></span>
        </span>
      </button>
    `).join('');
    list.querySelectorAll('[data-notification-id]').forEach((item, index) => {
      item.addEventListener('click', () => openNotification(rows[index]));
    });
  } catch (e) {
    if (panel?.isConnected) panel.querySelector('#notif-list').innerHTML = `<div class="notif-empty"><strong>Could not load notifications</strong><p>${escapeUi(e.message || 'Please try again.')}</p></div>`;
  }
}

async function markAllNotificationsRead(panel) {
  try {
    await api.patch('/notifications/read-all');
    notificationsCache = null;
    await loadNotifCount();
    await renderNotifications(panel);
  } catch (e) {
    toast(e.message || 'Could not mark notifications as read', 'error');
  }
}

async function clearAllNotifications(panel) {
  if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
  try {
    await api.delete('/notifications/clear-all');
    notificationsCache = null;
    await loadNotifCount();
    await renderNotifications(panel);
    toast('All notifications cleared', 'success');
  } catch (e) {
    toast(e.message || 'Could not clear notifications', 'error');
  }
}

async function openNotification(row) {
  try {
    if (!row.is_read) await api.patch(`/notifications/${row.id}/read`);
    if (notificationsCache) notificationsCache = notificationsCache.map((item) => item.id === row.id ? { ...item, is_read: true } : item);
    await loadNotifCount();
    document.getElementById('notif-panel')?.remove();
    window.location.href = appUrl(notificationLink(row));
  } catch (e) {
    toast(e.message || 'Could not open notification', 'error');
  }
}

function bindNotificationButtons(root = document) {
  root.querySelectorAll('#notif-btn, .topbar .icon-btn').forEach((button) => {
    if (button.dataset.notifBound) return;
    if (!button.querySelector('#notif-badge, .dot')) return;
    button.dataset.notifBound = '1';
    if (button.dataset.notifDirect === 'true') return;
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

async function showBirthdayCelebration() {
  let user = api.getUser();
  if (!user) return;

  try {
    if (!user.date_of_birth) {
      const profile = await api.get('/auth/me');
      user = { ...user, ...profile };
      api.setUser(user);
    }
    const birthday = String(user.date_of_birth || '');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Accra', month: '2-digit', day: '2-digit', year: 'numeric'
    }).formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {});
    if (!/^\d{4}-\d{2}-\d{2}/.test(birthday) || birthday.slice(5, 10) !== `${today.month}-${today.day}`) return;

    const celebrationKey = `hrconnect.birthday-celebration.${user.id}.${today.year}-${today.month}-${today.day}`;
    if (sessionStorage.getItem(celebrationKey)) return;
    sessionStorage.setItem(celebrationKey, '1');

    const confetti = Array.from({ length: 22 }, (_, index) => `<i style="--i:${index}"></i>`).join('');
    const celebration = document.createElement('section');
    celebration.className = 'birthday-celebration';
    celebration.setAttribute('role', 'status');
    celebration.innerHTML = `<div class="birthday-confetti" aria-hidden="true">${confetti}</div><div class="birthday-celebration-copy"><span>🎉 Happy birthday</span><strong>${escapeUi(user.first_name || 'there')}!</strong><p>Wishing you a wonderful year ahead.</p></div><button type="button" class="birthday-celebration-close" aria-label="Dismiss birthday message">×</button>`;
    celebration.querySelector('.birthday-celebration-close').addEventListener('click', () => celebration.remove());
    document.body.appendChild(celebration);
    setTimeout(() => celebration.remove(), 12000);
  } catch (_) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    addWebAppManifest();
    addBrandIcon();
    bindNotificationButtons();
    if (api.getToken()) { registerPushWorker(); showBirthdayCelebration(); }
  });
} else {
  addWebAppManifest();
  addBrandIcon();
  bindNotificationButtons();
  if (api.getToken()) { registerPushWorker(); showBirthdayCelebration(); }
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
