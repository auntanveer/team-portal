// ─── Chart.js global defaults ─────────────────────────────────────────────────
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#e2e8f0';
Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
Chart.defaults.font.size = 12;

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentView: 'dashboard',
  currentProjectId: null,
  editingProjectId: null,
  editingIssueId: null,
  issueFilter: 'all',
  allProjects: [],
  cachedIssues: [],   // issues for current project detail
  reportData: null,
  charts: {}
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d) ? '' :
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function isOverdue(project) {
  if (!project.endDate || project.status === 'completed') return false;
  return new Date(project.endDate + 'T23:59:59') < new Date();
}

function isDueOverdue(dueDate, status) {
  if (!dueDate || status === 'resolved') return false;
  return new Date(dueDate + 'T23:59:59') < new Date();
}

function statusLabel(s) {
  return s === 'on-hold' ? 'On Hold' : s.charAt(0).toUpperCase() + s.slice(1);
}

function progressBar(open, resolved) {
  const total = open + resolved;
  if (total === 0) return '<p class="progress-label" style="margin-top:.25rem;">No issues logged</p>';
  const pct = Math.round((resolved / total) * 100);
  return `
    <div class="progress-wrap">
      <div class="progress-info">
        <span class="progress-label">${resolved} of ${total} issues resolved</span>
        <span class="progress-label">${pct}%</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
    </div>`;
}

function showToast(message, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'show ' + type;
  setTimeout(() => t.className = '', 3200);
}

function showConfirmDialog(message, onConfirm) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-message').textContent = message;
  overlay.classList.add('show');
  document.getElementById('btn-confirm-yes').onclick = async () => {
    overlay.classList.remove('show');
    await onConfirm();
  };
  document.getElementById('btn-confirm-no').onclick = () => overlay.classList.remove('show');
}

// ─── Router ───────────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  state.currentView = name;
  document.querySelectorAll('[data-view]').forEach(a =>
    a.classList.toggle('active', a.dataset.view === name)
  );
  window.location.hash = '#' + name;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  showView('dashboard');
  document.getElementById('projects-grid').innerHTML = '<div class="loading">Loading projects…</div>';
  try {
    const [projects, deleted] = await Promise.all([getProjects(), getDeletedCounts()]);
    state.allProjects = projects;
    renderDashboardStats(projects, deleted);
    populateMemberFilter(projects);
    renderProjectCards(projects);
  } catch (err) {
    document.getElementById('projects-grid').innerHTML = '<div class="loading">Failed to load. Check your Apps Script URL.</div>';
    console.error(err);
  }
}

function renderDashboardStats(projects, deleted = { projects: 0, issues: 0 }) {
  const active     = projects.filter(p => p.status === 'active').length;
  const completed  = projects.filter(p => p.status === 'completed').length;
  document.getElementById('ds-active').textContent    = active;
  document.getElementById('ds-completed').textContent = completed;
  document.getElementById('ds-deleted').textContent   = deleted.projects + deleted.issues;
}

function populateMemberFilter(projects) {
  const members = [...new Set(projects.flatMap(p => p.resources || []))].sort();
  const sel = document.getElementById('member-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Members</option>' +
    members.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  sel.value = cur;
}

function renderProjectCards(projects) {
  const grid  = document.getElementById('projects-grid');
  const badge = document.getElementById('count-badge');
  badge.textContent = projects.length + ' project' + (projects.length !== 1 ? 's' : '');

  if (projects.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#128193;</span>
        <p>No projects match your filters.</p>
        <button class="btn btn-primary" onclick="openProjectForm(null)">+ New Project</button>
      </div>`;
    return;
  }

  grid.innerHTML = projects.map(p => {
    const chips    = (p.resources || []).map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');
    const dateRange= [formatDate(p.startDate), formatDate(p.endDate)].filter(Boolean).join(' → ') || 'No dates set';
    const overdue  = isOverdue(p);
    return `
      <div class="project-card">
        <div class="card-top">
          <span class="card-name">${escapeHtml(p.name)}</span>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap;justify-content:flex-end;">
            ${overdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
            <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
          </div>
        </div>
        ${p.description ? `<p class="card-desc">${escapeHtml(p.description)}</p>` : ''}
        <div class="card-meta">
          <span class="meta-item">&#128197; ${escapeHtml(dateRange)}</span>
        </div>
        ${chips ? `<div class="resource-chips">${chips}</div>` : ''}
        ${progressBar(p.openIssues || 0, p.resolvedIssues || 0)}
        <div class="card-actions">
          <button class="btn btn-ghost btn-sm btn-view-project" data-id="${p.id}">View</button>
          <button class="btn btn-ghost btn-sm btn-edit-project" data-id="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-project" data-id="${p.id}">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function filterProjects() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('status-filter').value;
  const member = document.getElementById('member-filter').value;
  const filtered = state.allProjects.filter(p =>
    p.name.toLowerCase().includes(search) &&
    (!status || p.status === status) &&
    (!member || (p.resources || []).includes(member))
  );
  renderProjectCards(filtered);
}

// ─── Project Detail ───────────────────────────────────────────────────────────
async function loadProjectDetail(projectId) {
  state.currentProjectId = projectId;
  state.issueFilter = 'all';
  showView('project-detail');
  document.getElementById('detail-header').innerHTML = '<div class="loading">Loading…</div>';
  document.getElementById('issues-list').innerHTML   = '<div class="loading">Loading issues…</div>';
  document.getElementById('notes-list').innerHTML    = '<div class="loading">Loading notes…</div>';
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));

  try {
    const [project, issues, notes] = await Promise.all([
      getProject(projectId),
      getIssues(projectId),
      getNotes(projectId)
    ]);
    if (!project) { showToast('Project not found', 'error'); loadDashboard(); return; }
    state.cachedIssues = issues;
    renderDetailHeader(project, issues);
    renderIssueList(issues);
    renderNotes(notes);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    console.error(err);
  }
}

function renderDetailHeader(p, issues) {
  const chips    = (p.resources || []).map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');
  const open     = issues.filter(i => i.status === 'open').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;
  const overdue  = isOverdue(p);

  document.getElementById('detail-header').innerHTML = `
    <div class="detail-title">
      ${escapeHtml(p.name)}
      ${overdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
      <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
    </div>
    ${p.description ? `<p class="detail-desc">${escapeHtml(p.description)}</p>` : ''}
    <div class="detail-meta">
      ${p.startDate ? `<span>&#128197; Start: ${formatDate(p.startDate)}</span>` : ''}
      ${p.endDate   ? `<span>&#127937; End: ${formatDate(p.endDate)}</span>` : ''}
      ${p.resources?.length ? `<span>&#128101; ${p.resources.length} member${p.resources.length !== 1 ? 's' : ''}</span>` : ''}
    </div>
    ${chips ? `<div class="resource-chips" style="margin-bottom:.75rem;">${chips}</div>` : ''}
    ${progressBar(open, resolved)}
    <div class="detail-actions" style="margin-top:1rem;">
      <button class="btn btn-ghost btn-sm" id="btn-edit-current-project">Edit Project</button>
      <button class="btn btn-danger btn-sm" id="btn-delete-current-project">Delete Project</button>
    </div>`;

  document.getElementById('btn-edit-current-project').addEventListener('click', () => openProjectForm(p.id));
  document.getElementById('btn-delete-current-project').addEventListener('click', () => confirmDeleteProject(p.id));
}

function renderIssueList(issues) {
  const filtered = state.issueFilter === 'all' ? issues : issues.filter(i => i.status === state.issueFilter);
  const list = document.getElementById('issues-list');

  if (filtered.length === 0) {
    const msg = state.issueFilter === 'all'
      ? 'No issues yet. Click <strong>+ Add Issue</strong> to get started.'
      : `No ${state.issueFilter} issues.`;
    list.innerHTML = `<div class="empty-state" style="padding:2rem;"><p>${msg}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(issue => {
    const dueOverdue = isDueOverdue(issue.dueDate, issue.status);
    const dueLabel   = issue.dueDate
      ? `<span class="issue-due ${dueOverdue ? 'overdue' : ''}">&#128197; Due ${formatDate(issue.dueDate)}${dueOverdue ? ' (Overdue)' : ''}</span>`
      : '';
    return `
      <div class="issue-card ${issue.status}">
        <div class="issue-top">
          <span class="issue-title">${escapeHtml(issue.title)}</span>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
            <span class="badge badge-${issue.priority || 'medium'}">${(issue.priority || 'medium').charAt(0).toUpperCase() + (issue.priority || 'medium').slice(1)}</span>
            <span class="badge badge-${issue.status}">${statusLabel(issue.status)}</span>
          </div>
        </div>
        ${issue.description ? `<p class="issue-body">${escapeHtml(issue.description)}</p>` : ''}
        ${issue.resolution  ? `<div class="issue-resolution">&#10003; ${escapeHtml(issue.resolution)}</div>` : ''}
        <div class="issue-footer">
          <div class="issue-meta">
            ${issue.assignedTo ? `<span>&#128100; ${escapeHtml(issue.assignedTo)}</span>` : ''}
            ${dueLabel}
          </div>
          <div class="issue-actions">
            <button class="btn btn-ghost btn-icon btn-edit-issue" data-id="${issue.id}">Edit</button>
            <button class="btn btn-danger btn-icon btn-delete-issue" data-id="${issue.id}">&#128465;</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Notes ────────────────────────────────────────────────────────────────────
function renderNotes(notes) {
  const list = document.getElementById('notes-list');
  if (!notes || notes.length === 0) {
    list.innerHTML = '<p class="notes-empty">No notes yet.</p>';
    return;
  }
  list.innerHTML = notes.map(n => `
    <div class="note-card">
      <div class="note-header">
        <span class="note-date">${formatDateTime(n.createdAt)}</span>
        <button class="btn btn-danger btn-icon btn-delete-note" data-id="${n.id}" style="padding:.2rem .5rem;font-size:.75rem;">&#128465;</button>
      </div>
      <p class="note-text">${escapeHtml(n.text)}</p>
    </div>`).join('');
}

// ─── Project Form ─────────────────────────────────────────────────────────────
async function openProjectForm(projectId = null) {
  state.editingProjectId = projectId;
  document.getElementById('project-form-title').textContent = projectId ? 'Edit Project' : 'New Project';
  const form = document.getElementById('project-form');
  form.reset();
  document.getElementById('project-form-id').value = '';

  if (projectId) {
    try {
      const p = await getProject(projectId);
      document.getElementById('project-form-id').value = p.id;
      form.elements['name'].value        = p.name || '';
      form.elements['description'].value = p.description || '';
      form.elements['startDate'].value   = p.startDate || '';
      form.elements['endDate'].value     = p.endDate || '';
      form.elements['status'].value      = p.status || 'active';
      form.elements['resources'].value   = (p.resources || []).join(', ');
    } catch (err) { showToast('Error: ' + err.message, 'error'); return; }
  }
  showView('project-form');
}

document.getElementById('project-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type="submit"]');
  btn.textContent = 'Saving…'; btn.disabled = true;

  const data = {
    name:        form.elements['name'].value.trim(),
    description: form.elements['description'].value.trim(),
    startDate:   form.elements['startDate'].value || null,
    endDate:     form.elements['endDate'].value || null,
    status:      form.elements['status'].value,
    resources:   form.elements['resources'].value.split(',').map(r => r.trim()).filter(Boolean)
  };

  if (!data.name) { showToast('Project name is required', 'error'); btn.textContent = 'Save Project'; btn.disabled = false; return; }

  try {
    if (state.editingProjectId) { await updateProject(state.editingProjectId, data); showToast('Project updated'); }
    else { await addProject(data); showToast('Project created'); }
    loadDashboard();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.textContent = 'Save Project'; btn.disabled = false; }
});

// ─── Issue Form ───────────────────────────────────────────────────────────────
async function openIssueForm(projectId, issueId = null) {
  state.editingIssueId   = issueId;
  state.currentProjectId = projectId;
  document.getElementById('issue-form-title').textContent = issueId ? 'Edit Issue' : 'New Issue';
  const form = document.getElementById('issue-form');
  form.reset();
  document.getElementById('issue-form-id').value         = '';
  document.getElementById('issue-form-project-id').value = projectId;
  form.elements['priority'].value = 'medium';
  toggleResolutionField('open');

  if (issueId) {
    try {
      const issue = state.cachedIssues.find(i => i.id === issueId) || (await getIssues(projectId)).find(i => i.id === issueId);
      if (!issue) { showToast('Issue not found', 'error'); return; }
      document.getElementById('issue-form-id').value  = issue.id;
      form.elements['title'].value       = issue.title || '';
      form.elements['description'].value = issue.description || '';
      form.elements['status'].value      = issue.status || 'open';
      form.elements['priority'].value    = issue.priority || 'medium';
      form.elements['assignedTo'].value  = issue.assignedTo || '';
      form.elements['dueDate'].value     = issue.dueDate || '';
      form.elements['resolution'].value  = issue.resolution || '';
      toggleResolutionField(issue.status);
    } catch (err) { showToast('Error: ' + err.message, 'error'); return; }
  }
  showView('issue-form');
}

function toggleResolutionField(status) {
  document.getElementById('resolution-wrap').style.display = status === 'resolved' ? 'block' : 'none';
}

document.getElementById('fi-status').addEventListener('change', e => toggleResolutionField(e.target.value));

document.getElementById('issue-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type="submit"]');
  btn.textContent = 'Saving…'; btn.disabled = true;

  const data = {
    title:       form.elements['title'].value.trim(),
    description: form.elements['description'].value.trim(),
    status:      form.elements['status'].value,
    priority:    form.elements['priority'].value,
    assignedTo:  form.elements['assignedTo'].value.trim(),
    dueDate:     form.elements['dueDate'].value || null,
    resolution:  form.elements['status'].value === 'resolved' ? form.elements['resolution'].value.trim() : ''
  };

  if (!data.title) { showToast('Issue title is required', 'error'); btn.textContent = 'Save Issue'; btn.disabled = false; return; }

  const pid = state.currentProjectId;
  try {
    if (state.editingIssueId) { await updateIssue(pid, state.editingIssueId, data); showToast('Issue updated'); }
    else { await addIssue(pid, data); showToast('Issue added'); }
    loadProjectDetail(pid);
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
  finally { btn.textContent = 'Save Issue'; btn.disabled = false; }
});

// ─── Delete Handlers ──────────────────────────────────────────────────────────
function confirmDeleteProject(projectId) {
  showConfirmDialog('Delete this project and all its issues and notes? This cannot be undone.', async () => {
    try { await deleteProject(projectId); showToast('Project deleted'); loadDashboard(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}

function confirmDeleteIssue(projectId, issueId) {
  showConfirmDialog('Delete this issue?', async () => {
    try { await deleteIssue(projectId, issueId); showToast('Issue deleted'); loadProjectDetail(projectId); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  });
}

// ─── Trash ────────────────────────────────────────────────────────────────────
async function loadTrash() {
  showView('trash');
  document.getElementById('trash-content').innerHTML = '<div class="loading">Loading deleted items…</div>';
  try {
    const { projects, issues } = await getDeletedItems();
    renderTrash(projects, issues);
  } catch (err) {
    document.getElementById('trash-content').innerHTML = '<div class="loading">Failed to load.</div>';
    console.error(err);
  }
}

function renderTrash(projects, issues) {
  const wrap = document.getElementById('trash-content');

  if (projects.length === 0 && issues.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:3rem;">
        <span class="empty-icon">&#128465;</span>
        <p>No deleted items. The trash is empty.</p>
      </div>`;
    return;
  }

  const projectsHtml = projects.length === 0 ? '' : `
    <div class="trash-section">
      <h2 class="trash-section-title">Deleted Projects <span class="trash-count">${projects.length}</span></h2>
      ${projects.map(p => `
        <div class="trash-card">
          <div class="trash-card-info">
            <span class="trash-card-name">${escapeHtml(p.name)}</span>
            ${p.description ? `<span class="trash-card-meta">${escapeHtml(p.description)}</span>` : ''}
            <span class="trash-card-meta">&#128197; ${formatDate(p.startDate) || 'No start'} ${p.endDate ? '→ ' + formatDate(p.endDate) : ''}</span>
          </div>
          <button class="btn btn-ghost btn-sm btn-restore-project" data-id="${p.id}">&#10227; Restore</button>
        </div>`).join('')}
    </div>`;

  const issuesHtml = issues.length === 0 ? '' : `
    <div class="trash-section">
      <h2 class="trash-section-title">Deleted Issues <span class="trash-count">${issues.length}</span></h2>
      ${issues.map(i => `
        <div class="trash-card">
          <div class="trash-card-info">
            <span class="trash-card-name">${escapeHtml(i.title)}</span>
            <span class="trash-card-meta">Project: ${escapeHtml(i.projectName)}</span>
            ${i.description ? `<span class="trash-card-meta">${escapeHtml(i.description)}</span>` : ''}
          </div>
          <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0;">
            <span class="badge badge-${i.priority || 'medium'}">${(i.priority||'medium').charAt(0).toUpperCase()+(i.priority||'medium').slice(1)}</span>
            <button class="btn btn-ghost btn-sm btn-restore-issue" data-id="${i.id}" data-project-id="${i.projectId}">&#10227; Restore</button>
          </div>
        </div>`).join('')}
    </div>`;

  wrap.innerHTML = projectsHtml + issuesHtml;
}

// ─── Issues Report ────────────────────────────────────────────────────────────
async function loadIssuesReport() {
  showView('issues-report');
  document.getElementById('issues-report-wrap').innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [reportData, deletedCounts] = await Promise.all([getReportData(), getDeletedCounts()]);
    state.reportData = reportData;
    populateIssueReportProjectFilter(reportData);
    renderIssueStats(reportData, deletedCounts);
    renderIssuesReportTable();
  } catch (err) {
    document.getElementById('issues-report-wrap').innerHTML = '<div class="loading">Failed to load.</div>';
    console.error(err);
  }
}

function renderIssueStats(reportData, deletedCounts) {
  const all = reportData.flatMap(d => d.issues);
  document.getElementById('is-open').textContent     = all.filter(i => i.status === 'open').length;
  document.getElementById('is-resolved').textContent = all.filter(i => i.status === 'resolved').length;
  document.getElementById('is-deleted').textContent  = deletedCounts.issues;
}

function populateIssueReportProjectFilter(reportData) {
  const sel = document.getElementById('ir-project-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Projects</option>' +
    reportData.map(d => `<option value="${escapeHtml(d.project.id)}">${escapeHtml(d.project.name)}</option>`).join('');
  if (cur) sel.value = cur;
}

function renderIssuesReportTable() {
  if (!state.reportData) return;
  const projectFilter  = document.getElementById('ir-project-filter').value;
  const statusFilter   = document.getElementById('ir-status-filter').value;
  const priorityFilter = document.getElementById('ir-priority-filter').value;

  const filtered = state.reportData
    .filter(d => !projectFilter || d.project.id === projectFilter)
    .map(d => ({
      project: d.project,
      issues: d.issues.filter(i =>
        (!statusFilter   || i.status   === statusFilter) &&
        (!priorityFilter || (i.priority || 'medium') === priorityFilter)
      )
    }))
    .filter(d => d.issues.length > 0);

  const wrap = document.getElementById('issues-report-wrap');

  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="empty-state" style="padding:3rem;"><span class="empty-icon">&#128202;</span><p>No issues match your filters.</p></div>';
    return;
  }

  const rows = filtered.flatMap(d =>
    d.issues.map((issue, idx) => `
      <tr>
        ${idx === 0 ? `<td rowspan="${d.issues.length}" class="ir-project-cell"><strong>${escapeHtml(d.project.name)}</strong></td>` : ''}
        <td>${escapeHtml(issue.title)}</td>
        <td><span class="badge badge-${issue.status}">${statusLabel(issue.status)}</span></td>
        <td><span class="badge badge-${issue.priority || 'medium'}">${(issue.priority || 'medium').charAt(0).toUpperCase() + (issue.priority || 'medium').slice(1)}</span></td>
        <td>${escapeHtml(issue.assignedTo || '—')}</td>
        <td>${formatDate(issue.dueDate) || '—'}</td>
      </tr>`)
  );

  wrap.innerHTML = `
    <div class="ir-table-wrap">
      <table class="ir-table">
        <thead><tr>
          <th>Project</th><th>Issue</th><th>Status</th><th>Priority</th><th>Assigned To</th><th>Due Date</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

// ─── Reports ──────────────────────────────────────────────────────────────────
async function loadReports() {
  showView('reports');
  ['stat-total-projects','stat-avg-duration','stat-open-issues','stat-resolved-issues']
    .forEach(id => document.getElementById(id).textContent = '…');
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  state.charts = {};

  try {
    state.reportData = await getReportData();
    renderSummaryStats(state.reportData);
    renderProjectsPerPersonChart(state.reportData);
    renderProjectStatusChart(state.reportData);
    renderIssuesPerProjectChart(state.reportData);
    renderDurationChart(state.reportData);
  } catch (err) { showToast('Error: ' + err.message, 'error'); console.error(err); }
}

function renderSummaryStats(reportData) {
  const allIssues   = reportData.flatMap(d => d.issues);
  const durations   = reportData
    .filter(d => d.project.startDate && d.project.endDate)
    .map(d => Math.round((new Date(d.project.endDate) - new Date(d.project.startDate)) / 86400000));
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) + 'd' : '—';

  document.getElementById('stat-total-projects').textContent  = reportData.length;
  document.getElementById('stat-avg-duration').textContent    = avgDuration;
  document.getElementById('stat-open-issues').textContent     = allIssues.filter(i => i.status === 'open').length;
  document.getElementById('stat-resolved-issues').textContent = allIssues.filter(i => i.status === 'resolved').length;
}

function chartColors(n) {
  const p = ['#7c3aed','#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#9333ea','#0284c7'];
  return Array.from({ length: n }, (_, i) => p[i % p.length]);
}

function renderProjectsPerPersonChart(reportData) {
  const map = {};
  reportData.forEach(({ project }) => (project.resources || []).forEach(r => map[r] = (map[r]||0)+1));
  const labels = Object.keys(map), data = labels.map(k => map[k]);
  if (!labels.length) return;
  state.charts.perPerson = new Chart(document.getElementById('chart-projects-per-person'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Projects', data, backgroundColor: chartColors(labels.length).map(c=>c+'cc'), borderColor: chartColors(labels.length), borderWidth: 1.5, borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } } }
  });
}

function renderProjectStatusChart(reportData) {
  const c = { active: 0, completed: 0, 'on-hold': 0 };
  reportData.forEach(({ project }) => { if (c[project.status] !== undefined) c[project.status]++; });
  state.charts.status = new Chart(document.getElementById('chart-project-status'), {
    type: 'doughnut',
    data: { labels: ['Active','Completed','On Hold'], datasets: [{ data: [c.active, c.completed, c['on-hold']], backgroundColor: ['#7c3aedcc','#2563ebcc','#d97706cc'], borderColor: ['#7c3aed','#2563eb','#d97706'], borderWidth: 2 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } } }, cutout: '65%' }
  });
}

function renderIssuesPerProjectChart(reportData) {
  const labels = reportData.map(d => d.project.name);
  state.charts.issues = new Chart(document.getElementById('chart-issues-per-project'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Open',     data: reportData.map(d => d.issues.filter(i=>i.status==='open').length),     backgroundColor: '#dc262680', borderColor: '#dc2626', borderWidth: 1.5, borderRadius: 4 },
      { label: 'Resolved', data: reportData.map(d => d.issues.filter(i=>i.status==='resolved').length), backgroundColor: '#16a34a80', borderColor: '#16a34a', borderWidth: 1.5, borderRadius: 4 }
    ]},
    options: { responsive: true, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } } }, plugins: { legend: { labels: { usePointStyle: true } } } }
  });
}

function renderDurationChart(reportData) {
  const d = reportData
    .filter(d => d.project.startDate && d.project.endDate)
    .map(d => ({ name: d.project.name, days: Math.round((new Date(d.project.endDate)-new Date(d.project.startDate))/86400000) }))
    .sort((a,b) => b.days - a.days);
  if (!d.length) return;
  state.charts.duration = new Chart(document.getElementById('chart-duration'), {
    type: 'bar',
    data: { labels: d.map(x=>x.name), datasets: [{ label: 'Days', data: d.map(x=>x.days), backgroundColor: '#2563eb80', borderColor: '#2563eb', borderWidth: 1.5, borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } } }
  });
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (!state.reportData) { showToast('Load the Reports page first', 'error'); return; }
  const rows = [['Project','Status','Start Date','End Date','Team Members','Total Issues','Open','Resolved','High Priority','Medium Priority','Low Priority']];
  state.reportData.forEach(({ project, issues }) => {
    rows.push([
      project.name, project.status,
      project.startDate || '', project.endDate || '',
      (project.resources || []).join('; '),
      issues.length,
      issues.filter(i=>i.status==='open').length,
      issues.filter(i=>i.status==='resolved').length,
      issues.filter(i=>i.priority==='high').length,
      issues.filter(i=>i.priority==='medium'||!i.priority).length,
      issues.filter(i=>i.priority==='low').length
    ]);
  });
  const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'team-portal-report.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav
  document.querySelector('nav').addEventListener('click', e => {
    const a = e.target.closest('[data-view]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.view === 'reports') loadReports();
    else if (a.dataset.view === 'issues-report') loadIssuesReport();
    else loadDashboard();
  });

  document.getElementById('btn-new-project').addEventListener('click', () => openProjectForm(null));

  // Dashboard filters
  document.getElementById('search-input').addEventListener('input', filterProjects);
  document.getElementById('status-filter').addEventListener('change', filterProjects);
  document.getElementById('member-filter').addEventListener('change', filterProjects);

  // Project card clicks (delegated)
  document.getElementById('projects-grid').addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.matches('.btn-view-project'))   loadProjectDetail(id);
    if (e.target.matches('.btn-edit-project'))   openProjectForm(id);
    if (e.target.matches('.btn-delete-project')) confirmDeleteProject(id);
  });

  // Project detail
  document.getElementById('btn-back-to-dashboard').addEventListener('click', loadDashboard);
  document.getElementById('btn-add-issue').addEventListener('click', () => openIssueForm(state.currentProjectId, null));

  // Issue filter tabs
  document.getElementById('issue-filter-tabs').addEventListener('click', async e => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    state.issueFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t === btn));
    renderIssueList(state.cachedIssues);
  });

  // Issue list actions (delegated)
  document.getElementById('issues-list').addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.matches('.btn-edit-issue'))   openIssueForm(state.currentProjectId, id);
    if (e.target.matches('.btn-delete-issue')) confirmDeleteIssue(state.currentProjectId, id);
  });

  // Notes
  document.getElementById('btn-add-note').addEventListener('click', async () => {
    const input = document.getElementById('note-input');
    const text  = input.value.trim();
    if (!text) { showToast('Note cannot be empty', 'error'); return; }
    const btn = document.getElementById('btn-add-note');
    btn.textContent = 'Adding…'; btn.disabled = true;
    try {
      await addNote(state.currentProjectId, text);
      input.value = '';
      const notes = await getNotes(state.currentProjectId);
      renderNotes(notes);
      showToast('Note added');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { btn.textContent = 'Add Note'; btn.disabled = false; }
  });

  document.getElementById('notes-list').addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id || !e.target.matches('.btn-delete-note')) return;
    showConfirmDialog('Delete this note?', async () => {
      try {
        await deleteNote(state.currentProjectId, id);
        const notes = await getNotes(state.currentProjectId);
        renderNotes(notes);
        showToast('Note deleted');
      } catch (err) { showToast('Error: ' + err.message, 'error'); }
    });
  });

  // Project form cancel
  document.getElementById('btn-cancel-project').addEventListener('click', loadDashboard);
  document.getElementById('btn-cancel-project-2').addEventListener('click', loadDashboard);

  // Issue form cancel
  document.getElementById('btn-cancel-issue').addEventListener('click', () => loadProjectDetail(state.currentProjectId));
  document.getElementById('btn-cancel-issue-2').addEventListener('click', () => loadProjectDetail(state.currentProjectId));

  // Trash
  document.getElementById('ds-deleted-tile').addEventListener('click', loadTrash);
  document.getElementById('btn-back-from-trash').addEventListener('click', loadDashboard);
  document.getElementById('btn-refresh-trash').addEventListener('click', loadTrash);

  document.getElementById('trash-content').addEventListener('click', async e => {
    if (e.target.matches('.btn-restore-project')) {
      const id  = e.target.dataset.id;
      const btn = e.target;
      btn.textContent = 'Restoring…'; btn.disabled = true;
      try {
        await restoreProject(id);
        showToast('Project restored');
        loadTrash();
      } catch (err) { showToast('Error: ' + err.message, 'error'); btn.textContent = '↺ Restore'; btn.disabled = false; }
    }
    if (e.target.matches('.btn-restore-issue')) {
      const id  = e.target.dataset.id;
      const pid = e.target.dataset.projectId;
      const btn = e.target;
      btn.textContent = 'Restoring…'; btn.disabled = true;
      try {
        await restoreIssue(pid, id);
        showToast('Issue restored');
        loadTrash();
      } catch (err) { showToast('Error: ' + err.message, 'error'); btn.textContent = '↺ Restore'; btn.disabled = false; }
    }
  });

  // Issues Report
  document.getElementById('btn-refresh-issues-report').addEventListener('click', loadIssuesReport);
  document.getElementById('ir-project-filter').addEventListener('change', renderIssuesReportTable);
  document.getElementById('ir-status-filter').addEventListener('change', renderIssuesReportTable);
  document.getElementById('ir-priority-filter').addEventListener('change', renderIssuesReportTable);

  // Reports
  document.getElementById('btn-refresh-reports').addEventListener('click', loadReports);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

  // Initial route
  const hash = window.location.hash.replace('#', '');
  if (hash === 'reports') loadReports();
  else if (hash === 'issues-report') loadIssuesReport();
  else loadDashboard();
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'reports' && state.currentView !== 'reports') loadReports();
  else if (hash === 'issues-report' && state.currentView !== 'issues-report') loadIssuesReport();
  else if ((!hash || hash === 'dashboard') && state.currentView !== 'dashboard') loadDashboard();
});
