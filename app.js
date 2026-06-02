// ─── Chart.js global defaults (light theme) ──────────────────────────────────
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
  charts: {}
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'show ' + type;
  setTimeout(() => toast.className = '', 3000);
}

function showConfirmDialog(message, onConfirm) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-message').textContent = message;
  overlay.classList.add('show');
  document.getElementById('btn-confirm-yes').onclick = async () => {
    overlay.classList.remove('show');
    await onConfirm();
  };
  document.getElementById('btn-confirm-no').onclick = () => {
    overlay.classList.remove('show');
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + viewName);
  if (el) el.classList.add('active');
  state.currentView = viewName;
  document.querySelectorAll('[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewName);
  });
  window.location.hash = '#' + viewName;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  showView('dashboard');
  document.getElementById('projects-grid').innerHTML = '<div class="loading">Loading projects…</div>';
  try {
    state.allProjects = await getProjects();
    renderProjectCards(state.allProjects);
  } catch (err) {
    document.getElementById('projects-grid').innerHTML = '<div class="loading">Failed to load. Check your Firebase config.</div>';
    console.error(err);
  }
}

function renderProjectCards(projects) {
  const grid = document.getElementById('projects-grid');
  const badge = document.getElementById('count-badge');
  badge.textContent = projects.length + ' project' + (projects.length !== 1 ? 's' : '');

  if (projects.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">&#128193;</span>
        <p>No projects yet.</p>
        <button class="btn btn-primary" onclick="openProjectForm(null)">+ Create your first project</button>
      </div>`;
    return;
  }

  grid.innerHTML = projects.map(p => {
    const resources = (p.resources || []).map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');
    const dateRange = [formatDate(p.startDate), formatDate(p.endDate)]
      .filter(Boolean).join(' → ') || 'No dates set';
    return `
      <div class="project-card">
        <div class="card-top">
          <span class="card-name">${escapeHtml(p.name)}</span>
          <span class="badge badge-${p.status}">${p.status === 'on-hold' ? 'On Hold' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
        </div>
        ${p.description ? `<p class="card-desc">${escapeHtml(p.description)}</p>` : ''}
        <div class="card-meta">
          <span class="meta-item">&#128197; ${escapeHtml(dateRange)}</span>
        </div>
        ${resources ? `<div class="resource-chips">${resources}</div>` : ''}
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
  const filtered = state.allProjects.filter(p => {
    const matchName = p.name.toLowerCase().includes(search);
    const matchStatus = !status || p.status === status;
    return matchName && matchStatus;
  });
  renderProjectCards(filtered);
}

// ─── Project Detail ───────────────────────────────────────────────────────────
async function loadProjectDetail(projectId) {
  state.currentProjectId = projectId;
  state.issueFilter = 'all';
  showView('project-detail');

  document.getElementById('detail-header').innerHTML = '<div class="loading">Loading…</div>';
  document.getElementById('issues-list').innerHTML = '<div class="loading">Loading issues…</div>';

  document.querySelectorAll('.filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === 'all');
  });

  try {
    const [project, issues] = await Promise.all([
      getProject(projectId),
      getIssues(projectId)
    ]);
    if (!project) { showToast('Project not found', 'error'); loadDashboard(); return; }
    renderDetailHeader(project);
    renderIssueList(issues);
  } catch (err) {
    showToast('Error loading project: ' + err.message, 'error');
    console.error(err);
  }
}

function renderDetailHeader(p) {
  const resources = (p.resources || []).map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');
  document.getElementById('detail-header').innerHTML = `
    <div class="detail-title">
      ${escapeHtml(p.name)}
      <span class="badge badge-${p.status}">${p.status === 'on-hold' ? 'On Hold' : p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
    </div>
    ${p.description ? `<p class="detail-desc">${escapeHtml(p.description)}</p>` : ''}
    <div class="detail-meta">
      ${p.startDate ? `<span>&#128197; Start: ${formatDate(p.startDate)}</span>` : ''}
      ${p.endDate   ? `<span>&#127937; End: ${formatDate(p.endDate)}</span>` : ''}
      ${p.resources && p.resources.length ? `<span>&#128101; Team: ${p.resources.length} member${p.resources.length !== 1 ? 's' : ''}</span>` : ''}
    </div>
    ${resources ? `<div class="resource-chips" style="margin-bottom:1rem;">${resources}</div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" id="btn-edit-current-project">Edit Project</button>
      <button class="btn btn-danger btn-sm" id="btn-delete-current-project">Delete Project</button>
    </div>`;

  document.getElementById('btn-edit-current-project')
    .addEventListener('click', () => openProjectForm(p.id));
  document.getElementById('btn-delete-current-project')
    .addEventListener('click', () => confirmDeleteProject(p.id));
}

function renderIssueList(issues) {
  const filtered = state.issueFilter === 'all'
    ? issues
    : issues.filter(i => i.status === state.issueFilter);

  const list = document.getElementById('issues-list');

  if (filtered.length === 0) {
    const msg = state.issueFilter === 'all'
      ? 'No issues yet. Click <strong>+ Add Issue</strong> to get started.'
      : `No ${state.issueFilter} issues.`;
    list.innerHTML = `<div class="empty-state" style="padding:2rem;"><p>${msg}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(issue => `
    <div class="issue-card ${issue.status}">
      <div class="issue-top">
        <span class="issue-title">${escapeHtml(issue.title)}</span>
        <span class="badge badge-${issue.status}">${issue.status.charAt(0).toUpperCase() + issue.status.slice(1)}</span>
      </div>
      ${issue.description ? `<p class="issue-body">${escapeHtml(issue.description)}</p>` : ''}
      ${issue.resolution ? `<div class="issue-resolution">&#10003; ${escapeHtml(issue.resolution)}</div>` : ''}
      <div class="issue-footer">
        <div class="issue-meta">
          ${issue.assignedTo ? `<span>&#128100; ${escapeHtml(issue.assignedTo)}</span>` : ''}
        </div>
        <div class="issue-actions">
          <button class="btn btn-ghost btn-icon btn-edit-issue" data-id="${issue.id}">Edit</button>
          <button class="btn btn-danger btn-icon btn-delete-issue" data-id="${issue.id}">&#128465;</button>
        </div>
      </div>
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
    } catch (err) {
      showToast('Error loading project: ' + err.message, 'error');
      return;
    }
  }
  showView('project-form');
}

document.getElementById('project-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const data = {
    name:        form.elements['name'].value.trim(),
    description: form.elements['description'].value.trim(),
    startDate:   form.elements['startDate'].value || null,
    endDate:     form.elements['endDate'].value || null,
    status:      form.elements['status'].value,
    resources:   form.elements['resources'].value
                   .split(',').map(r => r.trim()).filter(Boolean)
  };

  if (!data.name) {
    showToast('Project name is required', 'error');
    btn.textContent = 'Save Project';
    btn.disabled = false;
    return;
  }

  try {
    if (state.editingProjectId) {
      await updateProject(state.editingProjectId, data);
      showToast('Project updated');
    } else {
      await addProject(data);
      showToast('Project created');
    }
    loadDashboard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Save Project';
    btn.disabled = false;
  }
});

// ─── Issue Form ───────────────────────────────────────────────────────────────
async function openIssueForm(projectId, issueId = null) {
  state.editingIssueId = issueId;
  state.currentProjectId = projectId;
  document.getElementById('issue-form-title').textContent = issueId ? 'Edit Issue' : 'New Issue';
  const form = document.getElementById('issue-form');
  form.reset();
  document.getElementById('issue-form-id').value = '';
  document.getElementById('issue-form-project-id').value = projectId;
  toggleResolutionField('open');

  if (issueId) {
    try {
      const issues = await getIssues(projectId);
      const issue = issues.find(i => i.id === issueId);
      if (!issue) { showToast('Issue not found', 'error'); return; }
      document.getElementById('issue-form-id').value = issue.id;
      form.elements['title'].value       = issue.title || '';
      form.elements['description'].value = issue.description || '';
      form.elements['status'].value      = issue.status || 'open';
      form.elements['assignedTo'].value  = issue.assignedTo || '';
      form.elements['resolution'].value  = issue.resolution || '';
      toggleResolutionField(issue.status);
    } catch (err) {
      showToast('Error loading issue: ' + err.message, 'error');
      return;
    }
  }
  showView('issue-form');
}

function toggleResolutionField(status) {
  document.getElementById('resolution-wrap').style.display =
    status === 'resolved' ? 'block' : 'none';
}

document.getElementById('fi-status').addEventListener('change', e => {
  toggleResolutionField(e.target.value);
});

document.getElementById('issue-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  const data = {
    title:       form.elements['title'].value.trim(),
    description: form.elements['description'].value.trim(),
    status:      form.elements['status'].value,
    assignedTo:  form.elements['assignedTo'].value.trim(),
    resolution:  form.elements['status'].value === 'resolved'
                   ? form.elements['resolution'].value.trim()
                   : ''
  };

  if (!data.title) {
    showToast('Issue title is required', 'error');
    btn.textContent = 'Save Issue';
    btn.disabled = false;
    return;
  }

  const pid = state.currentProjectId;
  try {
    if (state.editingIssueId) {
      await updateIssue(pid, state.editingIssueId, data);
      showToast('Issue updated');
    } else {
      await addIssue(pid, data);
      showToast('Issue added');
    }
    loadProjectDetail(pid);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Save Issue';
    btn.disabled = false;
  }
});

// ─── Delete Handlers ──────────────────────────────────────────────────────────
function confirmDeleteProject(projectId) {
  showConfirmDialog('Delete this project and all its issues? This cannot be undone.', async () => {
    try {
      await deleteProject(projectId);
      showToast('Project deleted');
      loadDashboard();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

function confirmDeleteIssue(projectId, issueId) {
  showConfirmDialog('Delete this issue? This cannot be undone.', async () => {
    try {
      await deleteIssue(projectId, issueId);
      showToast('Issue deleted');
      loadProjectDetail(projectId);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────
async function loadReports() {
  showView('reports');
  ['stat-total-projects','stat-avg-duration','stat-open-issues','stat-resolved-issues']
    .forEach(id => document.getElementById(id).textContent = '…');

  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch(_) {} });
  state.charts = {};

  try {
    const reportData = await getReportData();
    renderSummaryStats(reportData);
    renderProjectsPerPersonChart(reportData);
    renderProjectStatusChart(reportData);
    renderIssuesPerProjectChart(reportData);
    renderDurationChart(reportData);
  } catch (err) {
    showToast('Error loading reports: ' + err.message, 'error');
    console.error(err);
  }
}

function renderSummaryStats(reportData) {
  const allIssues = reportData.flatMap(d => d.issues);
  const openCount = allIssues.filter(i => i.status === 'open').length;
  const resolvedCount = allIssues.filter(i => i.status === 'resolved').length;

  const durations = reportData
    .filter(d => d.project.startDate && d.project.endDate)
    .map(d => Math.round(
      (new Date(d.project.endDate) - new Date(d.project.startDate)) / 86400000
    ));
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) + 'd'
    : '—';

  document.getElementById('stat-total-projects').textContent   = reportData.length;
  document.getElementById('stat-avg-duration').textContent     = avgDuration;
  document.getElementById('stat-open-issues').textContent      = openCount;
  document.getElementById('stat-resolved-issues').textContent  = resolvedCount;
}

function chartColors(n) {
  const palette = ['#7c3aed','#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#9333ea','#0284c7'];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

function renderProjectsPerPersonChart(reportData) {
  const personMap = {};
  reportData.forEach(({ project }) => {
    (project.resources || []).forEach(person => {
      personMap[person] = (personMap[person] || 0) + 1;
    });
  });
  const labels = Object.keys(personMap);
  const data   = labels.map(k => personMap[k]);

  if (labels.length === 0) {
    document.getElementById('chart-projects-per-person').closest('.chart-card').innerHTML +=
      '<p style="color:var(--muted);font-size:.85rem;margin-top:.5rem;">No team members assigned yet.</p>';
    return;
  }

  state.charts.perPerson = new Chart(
    document.getElementById('chart-projects-per-person'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Projects',
          data,
          backgroundColor: chartColors(labels.length).map(c => c + 'cc'),
          borderColor: chartColors(labels.length),
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
          y: { grid: { display: false } }
        }
      }
    }
  );
}

function renderProjectStatusChart(reportData) {
  const counts = { active: 0, completed: 0, 'on-hold': 0 };
  reportData.forEach(({ project }) => {
    if (counts[project.status] !== undefined) counts[project.status]++;
  });

  state.charts.status = new Chart(
    document.getElementById('chart-project-status'),
    {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Completed', 'On Hold'],
        datasets: [{
          data: [counts.active, counts.completed, counts['on-hold']],
          backgroundColor: ['#7c3aedcc', '#2563ebcc', '#d97706cc'],
          borderColor: ['#7c3aed', '#2563eb', '#d97706'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true }
          }
        },
        cutout: '65%'
      }
    }
  );
}

function renderIssuesPerProjectChart(reportData) {
  const labels      = reportData.map(d => d.project.name);
  const openData    = reportData.map(d => d.issues.filter(i => i.status === 'open').length);
  const resolvedData = reportData.map(d => d.issues.filter(i => i.status === 'resolved').length);

  state.charts.issues = new Chart(
    document.getElementById('chart-issues-per-project'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Open',
            data: openData,
            backgroundColor: '#dc262680',
            borderColor: '#dc2626',
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'Resolved',
            data: resolvedData,
            backgroundColor: '#16a34a80',
            borderColor: '#16a34a',
            borderWidth: 1.5,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }
        },
        plugins: {
          legend: { labels: { usePointStyle: true } }
        }
      }
    }
  );
}

function renderDurationChart(reportData) {
  const withDates = reportData
    .filter(d => d.project.startDate && d.project.endDate)
    .map(d => ({
      name: d.project.name,
      days: Math.round(
        (new Date(d.project.endDate) - new Date(d.project.startDate)) / 86400000
      )
    }))
    .sort((a, b) => b.days - a.days);

  if (withDates.length === 0) {
    document.getElementById('chart-duration').closest('.chart-card').innerHTML +=
      '<p style="color:var(--muted);font-size:.85rem;margin-top:.5rem;">No projects with both start and end dates.</p>';
    return;
  }

  state.charts.duration = new Chart(
    document.getElementById('chart-duration'),
    {
      type: 'bar',
      data: {
        labels: withDates.map(d => d.name),
        datasets: [{
          label: 'Days',
          data: withDates.map(d => d.days),
          backgroundColor: '#2563eb80',
          borderColor: '#2563eb',
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' } },
          y: { grid: { display: false } }
        }
      }
    }
  );
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav links
  document.getElementById('main-nav') || true; // nav is the <nav> element
  document.querySelector('nav').addEventListener('click', e => {
    const a = e.target.closest('[data-view]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.view === 'reports') loadReports();
    else loadDashboard();
  });

  // New Project button (nav)
  document.getElementById('btn-new-project')
    .addEventListener('click', () => openProjectForm(null));

  // Dashboard: search + filter
  document.getElementById('search-input').addEventListener('input', filterProjects);
  document.getElementById('status-filter').addEventListener('change', filterProjects);

  // Dashboard: project card actions (delegated)
  document.getElementById('projects-grid').addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.matches('.btn-view-project')) loadProjectDetail(id);
    if (e.target.matches('.btn-edit-project')) openProjectForm(id);
    if (e.target.matches('.btn-delete-project')) confirmDeleteProject(id);
  });

  // Back to dashboard
  document.getElementById('btn-back-to-dashboard')
    .addEventListener('click', loadDashboard);

  // Add Issue button
  document.getElementById('btn-add-issue')
    .addEventListener('click', () => openIssueForm(state.currentProjectId, null));

  // Issue filter tabs
  document.getElementById('issue-filter-tabs').addEventListener('click', async e => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    state.issueFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach(t =>
      t.classList.toggle('active', t === btn)
    );
    const issues = await getIssues(state.currentProjectId);
    renderIssueList(issues);
  });

  // Issue list actions (delegated)
  document.getElementById('issues-list').addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.matches('.btn-edit-issue'))
      openIssueForm(state.currentProjectId, id);
    if (e.target.matches('.btn-delete-issue'))
      confirmDeleteIssue(state.currentProjectId, id);
  });

  // Project form cancel buttons
  document.getElementById('btn-cancel-project')
    .addEventListener('click', loadDashboard);
  document.getElementById('btn-cancel-project-2')
    .addEventListener('click', loadDashboard);

  // Issue form cancel buttons
  document.getElementById('btn-cancel-issue')
    .addEventListener('click', () => loadProjectDetail(state.currentProjectId));
  document.getElementById('btn-cancel-issue-2')
    .addEventListener('click', () => loadProjectDetail(state.currentProjectId));

  // Reports refresh
  document.getElementById('btn-refresh-reports')
    .addEventListener('click', loadReports);

  // Hash-based initial routing
  const hash = window.location.hash.replace('#', '');
  if (hash === 'reports') loadReports();
  else loadDashboard();
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'reports' && state.currentView !== 'reports') loadReports();
  else if ((hash === 'dashboard' || !hash) && state.currentView !== 'dashboard') loadDashboard();
});
