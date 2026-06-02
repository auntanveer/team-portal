// Paste your deployed Apps Script Web App URL here
// (Extensions → Apps Script → Deploy → Manage deployments → copy Web app URL)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzsZWRZB2tlp4SCXNolEqyvH4LplaVMtGFG49WVSV2CTHekr94FmxMouaD9MZWBgAlydA/exec';
//const SCRIPT_URL = 'https://script.google.com/a/macros/hlbb.hongleong.com.my/s/AKfycbz5Nq_LtmzRzI-HLeC-uJn1PY2xd60Hf_Nc9w0KmIFqT3VOCfokHlBK6j4fVb6yqlP2ew/exec';
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

// ─── Notes ────────────────────────────────────────────────────────────────────

async function getNotes(projectId) {
  return apiGet({ action: 'getNotes', projectId });
}

async function addNote(projectId, text) {
  return apiPost({ action: 'addNote', projectId, text });
}

async function deleteNote(projectId, noteId) {
  return apiPost({ action: 'deleteNote', projectId, id: noteId });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function getReportData() {
  return apiGet({ action: 'getReportData' });
}

async function getDeletedCounts() {
  return apiGet({ action: 'getDeletedCounts' });
}
