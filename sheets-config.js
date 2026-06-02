// Paste your deployed Apps Script Web App URL here
// (Extensions → Apps Script → Deploy → Manage deployments → copy Web app URL)
const SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function apiGet(params) {
  const url = SCRIPT_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { redirect: 'follow' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiPost(body) {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

async function getProjects() {
  return apiGet({ action: 'getProjects' });
}

async function getProject(projectId) {
  return apiGet({ action: 'getProject', projectId });
}

async function addProject(data) {
  return apiPost({ action: 'addProject', data });
}

async function updateProject(projectId, data) {
  return apiPost({ action: 'updateProject', id: projectId, data });
}

async function deleteProject(projectId) {
  return apiPost({ action: 'deleteProject', id: projectId });
}

// ─── Issues ───────────────────────────────────────────────────────────────────

async function getIssues(projectId) {
  return apiGet({ action: 'getIssues', projectId });
}

async function addIssue(projectId, data) {
  return apiPost({ action: 'addIssue', projectId, data });
}

async function updateIssue(projectId, issueId, data) {
  return apiPost({ action: 'updateIssue', projectId, id: issueId, data });
}

async function deleteIssue(projectId, issueId) {
  return apiPost({ action: 'deleteIssue', projectId, id: issueId });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function getReportData() {
  return apiGet({ action: 'getReportData' });
}
