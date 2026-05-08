const BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('fw_token');
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body !== null) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);

  // Auto-logout on 401
  if (res.status === 401) {
    localStorage.removeItem('fw_token');
    localStorage.removeItem('fw_user');
    window.location.href = '/login';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const auth = {
  login:  (employeeId, password) => request('POST', '/auth/login', { employeeId, password }),
  logout: ()                      => request('POST', '/auth/logout'),
};

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
export const projects = {
  list:   ()       => request('GET',    '/projects'),
  get:    (id)     => request('GET',    `/projects/${id}`),
  create: (body)   => request('POST',   '/projects', body),
  update: (id, b)  => request('PUT',    `/projects/${id}`, b),
  delete: (id)     => request('DELETE', `/projects/${id}`),
};

// ─── SECTIONS ─────────────────────────────────────────────────────────────────
export const sections = {
  tree:                  (id)              => request('GET',    `/projects/${id}/tree`),
  saveToggles:           (id, body)        => request('PUT',    `/projects/${id}/toggles`, body),
  getTableRows:          (id, tblId)       => request('GET',    `/projects/${id}/tablerows/${tblId}`),
  addTableRow:           (id, tblId, body) => request('POST',   `/projects/${id}/tablerows/${tblId}`, body),
  updateTableRow:        (id, rowId, body) => request('PUT',    `/projects/${id}/tablerows/${rowId}`, body),
  deleteTableRow:        (id, rowId)       => request('DELETE', `/projects/${id}/tablerows/${rowId}`),
  toggleSeedRow:         (id, rowId, body) => request('PUT',    `/projects/${id}/seedrows/${rowId}`, body),
  getContentSelections:  (id, sectionId)   => request('GET',    `/projects/${id}/contentselections?sectionId=${sectionId}`),
  saveContentSelections: (id, body)        => request('PUT',    `/projects/${id}/contentselections`, body),
};

// ─── FIELDS ───────────────────────────────────────────────────────────────────
export const fields = {
  getValues:  (id)       => request('GET', `/projects/${id}/values`),
  saveValues: (id, body) => request('PUT', `/projects/${id}/values`, body),
};

// ─── GENERATE ─────────────────────────────────────────────────────────────────
export const generate = {
  document: (id) => request('POST', `/generate/${id}`),
};

// ─── REVISIONS ────────────────────────────────────────────────────────────────
export const revisions = {
  // Revision History CRUD
  list:   (id)              => request('GET',    `/projects/${id}/revisions`),
  create: (id, body)        => request('POST',   `/projects/${id}/revisions`, body),
  update: (id, code, body)  => request('PUT',    `/projects/${id}/revisions/${encodeURIComponent(code)}`, body),
  remove: (id, code)        => request('DELETE', `/projects/${id}/revisions/${encodeURIComponent(code)}`),

  // Active revision state
  setActive:    (id, revisionCode) => request('PATCH', `/projects/${id}/active-revision`, { revisionCode }),
  stopTracking: (id)               => request('PATCH', `/projects/${id}/active-revision`, { revisionCode: null }),

  // Clause revision marks
  getMarks:    (id)       => request('GET',    `/projects/${id}/clausemarks`),
  addMark:     (id, body) => request('POST',   `/projects/${id}/clausemarks`, body),
  clearMarks:  (id, code) => request('DELETE', `/projects/${id}/clausemarks`, { revisionCode: code }),
};

// ─── ADMIN (Phase 8) ──────────────────────────────────────────────────────────
export const admin = {
  // User management
  getUsers:    ()           => request('GET',    '/admin/users'),
  createUser:  (body)       => request('POST',   '/admin/users', body),
  updateUser:  (id, body)   => request('PUT',    `/admin/users/${id}`, body),
  deleteUser:  (id)         => request('DELETE', `/admin/users/${id}`),

  // Stats
  getStats:    ()           => request('GET',    '/admin/stats'),

  // Dev Mode — sections
  getSections:   ()              => request('GET',  '/admin/sections'),
  updateSection: (id, body)      => request('PUT',  `/admin/sections/${id}`, body),
  createField:   (sectionId, body) => request('POST', `/admin/sections/${sectionId}/fields`, body),

  // Dev Mode — fields
  getFields:   ()           => request('GET',    '/admin/fields'),
  updateField: (id, body)   => request('PUT',    `/admin/fields/${id}`, body),
  deleteField: (id)         => request('DELETE', `/admin/fields/${id}`),

  // Dev Mode — seed row management
  addSeedRow:    (tableId, body) => request('POST',   `/admin/tables/${tableId}/seedrows`, body),
  updateSeedRow: (rowId, body)   => request('PUT',    `/admin/seedrows/${rowId}`, body),
  deleteSeedRow: (rowId)         => request('DELETE', `/admin/seedrows/${rowId}`),

  // Generation log
  getGenerationLogs: ()     => request('GET',    '/admin/generation-logs'),
};