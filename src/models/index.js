// Entity models (Model layer of the frontend). One object per backend resource.
// Each method maps to a backend route and returns the unwrapped `data`.
import { api } from './api.client';

const data = p => p.then(r => r.data);
const full = p => p; // keeps meta / pagination

export const AuthModel = {
  login: (email, password) => data(api.post('/auth/login', { email, password })),
  register: payload => data(api.post('/auth/register', payload)),
  forgotPassword: email => api.post('/auth/forgot-password', { email }),
  changePassword: (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }),
  me: () => data(api.get('/auth/me')),
  health: () => api.get('/health')
};

export const EmployeeModel = {
  list: params => data(api.get('/employees', { limit: 500, ...(params || {}) })),
  nextId: () => data(api.get('/employees/next-id')).then(r => (r && r.nextId) || ''),
  get: id => data(api.get('/employees/' + id)),
  create: body => data(api.post('/employees', body)),
  update: (id, body) => data(api.put('/employees/' + id, body)),
  import: (rows, dryRun) => data(api.post('/employees/import', { rows, dryRun })),
  remove: id => api.del('/employees/' + id)
};

export const DepartmentModel = {
  list: () => data(api.get('/departments')),
  create: body => data(api.post('/departments', body)),
  update: (id, body) => data(api.put('/departments/' + id, body)),
  remove: id => api.del('/departments/' + id)
};

export const ProjectModel = {
  list: () => data(api.get('/projects')),
  get: id => data(api.get('/projects/' + id)),
  create: body => data(api.post('/projects', body)),
  update: (id, body) => data(api.put('/projects/' + id, body)),
  remove: id => api.del('/projects/' + id)
};

export const SettingsModel = {
  get: () => data(api.get('/settings')),
  update: body => data(api.put('/settings', body)),
  resetData: (confirm, deleteLogins) => data(api.post('/settings/reset-data', { confirm, deleteLogins }))
};

export const ClientModel = {
  list: month => full(api.get('/clients', month ? { month } : undefined)),
  get: (id, month) => data(api.get('/clients/' + id, month ? { month } : undefined)),
  create: body => data(api.post('/clients', body)),
  update: (id, body) => data(api.put('/clients/' + id, body)),
  remove: id => api.del('/clients/' + id)
};

export const TaskModel = {
  list: params => full(api.get('/tasks', { limit: 500, ...(params || {}) })),
  get: id => data(api.get('/tasks/' + id)),
  create: body => data(api.post('/tasks', body)),
  update: (id, body) => data(api.put('/tasks/' + id, body)),
  setStatus: (id, status) => data(api.patch('/tasks/' + id + '/status', { status })),
  reassign: (id, assignee, note) => data(api.post('/tasks/' + id + '/reassign', { assignee, note })),
  reject: (id, reason) => data(api.post('/tasks/' + id + '/reject', { reason })),
  selfAssign: body => data(api.post('/tasks/self', body)),
  remove: id => api.del('/tasks/' + id)
};

export const AttendanceModel = {
  today: () => data(api.get('/attendance/today')),
  list: params => data(api.get('/attendance', params)),
  stats: (empId, month) => data(api.get('/attendance/stats/' + empId, { month })),
  teamSummary: month => data(api.get('/attendance/team-summary', { month })),
  clockIn: body => data(api.post('/attendance/clock-in', body)),
  clockOut: body => data(api.post('/attendance/clock-out', body)),
  breakStart: () => api.post('/attendance/break/start'),
  breakEnd: () => api.post('/attendance/break/end'),
  mark: body => data(api.post('/attendance/mark', body)),
  selfie: async (id, which) => { const res = await api.download('/attendance/' + id + '/selfie/' + which); return res.blob(); },
  update: (id, body) => data(api.put('/attendance/' + id, body))
};

export const LeaveModel = {
  list: params => data(api.get('/leaves', params)),
  today: () => data(api.get('/leaves/today')),
  apply: body => data(api.post('/leaves', body)),
  decide: (id, status, note) => data(api.patch('/leaves/' + id + '/decide', { status, note })),
  remove: id => api.del('/leaves/' + id)
};

export const PaymentModel = {
  list: params => full(api.get('/payments', { limit: 500, ...(params || {}) })),
  create: body => data(api.post('/payments', body)),
  update: (id, body) => data(api.put('/payments/' + id, body)),
  remove: id => api.del('/payments/' + id)
};

export const PayrollModel = {
  get: month => data(api.get('/payroll', { month })),
  payAll: month => data(api.post('/payroll/pay-all', { month }))
};

export const HolidayModel = {
  list: upcoming => data(api.get('/holidays', upcoming ? { upcoming: 'true' } : undefined)),
  create: body => data(api.post('/holidays', body)),
  remove: id => api.del('/holidays/' + id)
};

export const TodoModel = {
  list: () => data(api.get('/todos')),
  create: text => data(api.post('/todos', { text })),
  toggle: id => data(api.patch('/todos/' + id + '/toggle')),
  remove: id => api.del('/todos/' + id)
};

export const FileModel = {
  list: () => data(api.get('/files')),
  upload: (file, project) => { const fd = new FormData(); fd.append('file', file); if (project) fd.append('project', project); return data(api.post('/files/upload', fd)); },
  downloadUrl: id => '/api/files/' + id + '/download',
  remove: id => api.del('/files/' + id)
};

export const ActivityModel = {
  list: limit => full(api.get('/activity', { limit: limit || 60 })),
  markAllRead: () => api.post('/activity/read-all'),
  remove: id => api.del('/activity/' + id),
  clear: () => api.del('/activity'),
  alerts: () => data(api.get('/activity/alerts')),
  broadcast: (text, dept) => api.post('/activity/broadcast', { text, dept })
};

export const PushModel = {
  key: () => data(api.get('/push/key')),
  status: () => data(api.get('/push/status')),
  subscribe: subscription => api.post('/push/subscribe', { subscription }),
  unsubscribe: endpoint => api.post('/push/unsubscribe', { endpoint }),
  test: () => api.post('/push/test')
};

export const PerformanceModel = {
  get: month => data(api.get('/performance', { month })),
  rate: (emp, month, marks, note) => data(api.put('/performance/rating', { emp, month, marks, note }))
};

export const ProductivityModel = {
  get: month => data(api.get('/productivity', { month }))
};

export const AssistantModel = {
  chat: messages => data(api.post('/assistant/chat', { messages })),
  whatsapp: text => data(api.post('/assistant/whatsapp', { text }))
};

export const ReportModel = {
  // Returns a Blob for the CSV; the caller triggers the download.
  download: async (name, params) => {
    const res = await api.download('/reports/' + name, params);
    return res.blob();
  }
};

// AI Agent page: prompt studio, content writing (social + scripts), scheduling, ads. Backend: /api/ai/*
export const AiModel = {
  meta: () => data(api.get('/ai/meta')),
  prompts: body => data(api.post('/ai/prompts', body)),
  content: body => data(api.post('/ai/content', body)),
  script: body => data(api.post('/ai/script', body)),
  schedule: body => data(api.post('/ai/schedule', body)),
  ads: body => data(api.post('/ai/ads', body))
};
AiModel.deck = body => data(api.post('/ai/deck', body));
AiModel.deckDesign = outline => data(api.post('/ai/deck/design', { outline }));
AiModel.history = params => data(api.get('/ai/history', params));
AiModel.run = id => data(api.get('/ai/history/' + id));
AiModel.runPdf = id => data(api.get('/ai/history/' + id + '/pdf'));
AiModel.runPptx = id => data(api.get('/ai/history/' + id + '/pptx'));
AiModel.runDelete = id => api.del('/ai/history/' + id);
AiModel.references = () => data(api.get('/ai/references'));
AiModel.referenceUpload = (file, save) => { const fd = new FormData(); fd.append('file', file); return data(api.post('/ai/references' + (save ? '?save=1' : ''), fd)); };
AiModel.referenceDelete = id => api.del('/ai/references/' + id);
AiModel.scheduleLatest = () => data(api.get('/ai/schedule/latest'));
AiModel.runState = (id, done) => data(api.patch('/ai/history/' + id + '/state', { done }));

export const SalarySlipModel = {
  list: (empId, fy) => api.get('/salary-slips/' + empId, fy ? { fy } : undefined).then(r => (r && r.data) || r),
  generate: body => api.post('/salary-slips/generate', body).then(r => (r && r.data) || r),
  update: (id, body) => api.put('/salary-slips/' + id, body).then(r => (r && r.data) || r),
  remove: id => api.del('/salary-slips/' + id)
};

