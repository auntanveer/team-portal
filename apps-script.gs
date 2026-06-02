// ════════════════════════════════════════════════════════════════════════════
// Team Portal — Google Apps Script backend
// HOW TO USE:
//   1. Open your Google Sheet → Extensions → Apps Script
//   2. Delete existing code, paste this entire file, Save
//   3. Deploy → Manage deployments → edit → New version → Deploy
//   (URL stays the same after redeployment)
// ════════════════════════════════════════════════════════════════════════════

const PROJECT_COLS = ['id','name','description','startDate','endDate','status','resources','createdAt','openIssues','resolvedIssues'];
const ISSUE_COLS   = ['id','projectId','title','description','status','resolution','assignedTo','createdAt','resolvedAt','priority','dueDate'];
const NOTE_COLS    = ['id','projectId','text','createdAt'];

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const cols = name === 'Projects' ? PROJECT_COLS : name === 'Issues' ? ISSUE_COLS : NOTE_COLS;
    sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
    sheet.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sheet;
}

// Google Sheets auto-converts date strings to Date objects on storage.
function cellToDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(val);
}

function cellToTs(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function ok(data)  { return ContentService.createTextOutput(JSON.stringify({ ok: true,  data })).setMimeType(ContentService.MimeType.JSON); }
function err(msg)  { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg })).setMimeType(ContentService.MimeType.JSON); }

// ── GET handler ──────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action    = e.parameter.action;
    const projectId = e.parameter.projectId;

    if (action === 'getProjects')      return ok(getProjects());
    if (action === 'getProject')       return ok(getProject(projectId));
    if (action === 'getIssues')        return ok(getIssues(projectId));
    if (action === 'getNotes')         return ok(getNotes(projectId));
    if (action === 'getReportData')    return ok(getReportData());
    if (action === 'getDeletedCounts') return ok(getDeletedCounts());
    if (action === 'getDeletedItems')  return ok(getDeletedItems());
    return err('Unknown action: ' + action);
  } catch(e) {
    return err(e.message);
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, id, projectId, data, text } = body;

    if (action === 'addProject')     return ok(addProject(data));
    if (action === 'updateProject')  return ok(updateProject(id, data));
    if (action === 'deleteProject')  return ok(deleteProject(id));
    if (action === 'restoreProject') return ok(restoreProject(id));
    if (action === 'addIssue')       return ok(addIssue(projectId, data));
    if (action === 'updateIssue')    return ok(updateIssue(projectId, id, data));
    if (action === 'deleteIssue')    return ok(deleteIssue(projectId, id));
    if (action === 'restoreIssue')   return ok(restoreIssue(projectId, id));
    if (action === 'addNote')        return ok(addNote(projectId, text));
    if (action === 'deleteNote')     return ok(deleteNote(projectId, id));
    return err('Unknown action: ' + action);
  } catch(e) {
    return err(e.message);
  }
}

// ── Projects ─────────────────────────────────────────────────────────────────
function rowToProject(row) {
  return {
    id:             String(row[0] || ''),
    name:           String(row[1] || ''),
    description:    String(row[2] || ''),
    startDate:      cellToDate(row[3]),
    endDate:        cellToDate(row[4]),
    status:         String(row[5] || 'active'),
    resources:      row[6] ? String(row[6]).split(',').map(r => r.trim()).filter(Boolean) : [],
    createdAt:      cellToTs(row[7]),
    openIssues:     parseInt(row[8]) || 0,
    resolvedIssues: parseInt(row[9]) || 0
  };
}

function autoFillMissingIds() {
  const sheet = getSheet('Projects');
  const data  = sheet.getDataRange().getValues();
  const now   = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    const hasId   = data[i][0] && String(data[i][0]).trim();
    const hasName = data[i][1] && String(data[i][1]).trim();
    if (!hasId && hasName) {
      sheet.getRange(i + 1, 1).setValue(makeId());
      if (!data[i][7]) sheet.getRange(i + 1, 8).setValue(now);
      if (!data[i][5]) sheet.getRange(i + 1, 6).setValue('active');
    }
  }
}

function getProjects() {
  autoFillMissingIds();
  const sheet = getSheet('Projects');
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  // Count issues live from the Issues sheet so cards are always accurate
  const issueSheet = getSheet('Issues');
  const issueData  = issueSheet.getDataRange().getValues();
  const counts = {};
  if (issueData.length > 1) {
    issueData.slice(1).forEach(row => {
      const pid    = String(row[1] || '');
      const status = String(row[4] || 'open');
      if (!pid) return;
      if (!counts[pid]) counts[pid] = { open: 0, resolved: 0 };
      if (status === 'open') counts[pid].open++;
      else if (status === 'resolved') counts[pid].resolved++;
    });
  }

  return data.slice(1)
    .map(row => {
      const p = rowToProject(row);
      const c = counts[p.id] || { open: 0, resolved: 0 };
      p.openIssues     = c.open;
      p.resolvedIssues = c.resolved;
      return p;
    })
    .filter(p => p.id && p.status !== 'deleted')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getProject(projectId) {
  return getProjects().find(p => p.id === projectId) || null;
}

function addProject(data) {
  const sheet = getSheet('Projects');
  const id    = makeId();
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, data.name || '', data.description || '',
    data.startDate || '', data.endDate || '',
    data.status || 'active', (data.resources || []).join(', '),
    now, 0, 0
  ]);
  return { id };
}

function updateProject(projectId, data) {
  const sheet = getSheet('Projects');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === projectId) {
      const updated = [
        projectId,
        data.name        !== undefined ? data.name        : rows[i][1],
        data.description !== undefined ? data.description : rows[i][2],
        data.startDate   !== undefined ? data.startDate   : rows[i][3],
        data.endDate     !== undefined ? data.endDate     : rows[i][4],
        data.status      !== undefined ? data.status      : rows[i][5],
        data.resources   !== undefined ? data.resources.join(', ') : rows[i][6],
        rows[i][7],
        parseInt(rows[i][8]) || 0,
        parseInt(rows[i][9]) || 0
      ];
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      return { id: projectId };
    }
  }
  throw new Error('Project not found: ' + projectId);
}

function deleteProject(projectId) {
  softDeleteIssuesByProject(projectId);
  deleteNotesByProject(projectId);
  const sheet = getSheet('Projects');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === projectId) {
      sheet.getRange(i + 1, 6).setValue('deleted');
      return { id: projectId };
    }
  }
  throw new Error('Project not found: ' + projectId);
}

function softDeleteIssuesByProject(projectId) {
  const sheet = getSheet('Issues');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === projectId && String(rows[i][4]) !== 'deleted') {
      sheet.getRange(i + 1, 5).setValue('deleted');
    }
  }
}

function getDeletedCounts() {
  const projData  = getSheet('Projects').getDataRange().getValues();
  const issueData = getSheet('Issues').getDataRange().getValues();
  const projects  = projData.slice(1).filter(r => r[0] && String(r[5]) === 'deleted').length;
  const issues    = issueData.slice(1).filter(r => r[0] && String(r[4]) === 'deleted').length;
  return { projects, issues };
}

function getDeletedItems() {
  const projData  = getSheet('Projects').getDataRange().getValues();
  const issueData = getSheet('Issues').getDataRange().getValues();

  const projectNames = {};
  projData.slice(1).forEach(r => { if (r[0]) projectNames[String(r[0])] = String(r[1]); });

  const projects = projData.slice(1)
    .filter(r => r[0] && String(r[5]) === 'deleted')
    .map(rowToProject);

  const issues = issueData.slice(1)
    .filter(r => r[0] && String(r[4]) === 'deleted')
    .map(row => {
      const issue = rowToIssue(row);
      issue.projectName = projectNames[issue.projectId] || 'Unknown Project';
      return issue;
    });

  return { projects, issues };
}

function restoreProject(projectId) {
  const projSheet  = getSheet('Projects');
  const issueSheet = getSheet('Issues');

  const projRows = projSheet.getDataRange().getValues();
  for (let i = 1; i < projRows.length; i++) {
    if (String(projRows[i][0]) === projectId) {
      projSheet.getRange(i + 1, 6).setValue('active');
      break;
    }
  }

  const issueRows = issueSheet.getDataRange().getValues();
  for (let i = 1; i < issueRows.length; i++) {
    if (String(issueRows[i][1]) === projectId && String(issueRows[i][4]) === 'deleted') {
      issueSheet.getRange(i + 1, 5).setValue('open');
    }
  }

  updateProjectCounts(projectId);
  return { id: projectId };
}

function restoreIssue(projectId, issueId) {
  const sheet = getSheet('Issues');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === issueId && String(rows[i][1]) === projectId) {
      sheet.getRange(i + 1, 5).setValue('open');
      updateProjectCounts(projectId);
      return { id: issueId };
    }
  }
  throw new Error('Issue not found: ' + issueId);
}

function updateProjectCounts(projectId) {
  const issues   = getIssues(projectId);
  const open     = issues.filter(i => i.status === 'open').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;
  const sheet    = getSheet('Projects');
  const rows     = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === projectId) {
      sheet.getRange(i + 1, 9, 1, 2).setValues([[open, resolved]]);
      return;
    }
  }
}

// ── Issues ───────────────────────────────────────────────────────────────────
function rowToIssue(row) {
  return {
    id:          String(row[0] || ''),
    projectId:   String(row[1] || ''),
    title:       String(row[2] || ''),
    description: String(row[3] || ''),
    status:      String(row[4] || 'open'),
    resolution:  String(row[5] || ''),
    assignedTo:  String(row[6] || ''),
    createdAt:   cellToTs(row[7]),
    resolvedAt:  cellToTs(row[8]),
    priority:    String(row[9] || 'medium'),
    dueDate:     cellToDate(row[10])
  };
}

function getIssues(projectId) {
  const sheet = getSheet('Issues');
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .map(rowToIssue)
    .filter(i => i.id && i.projectId === projectId && i.status !== 'deleted')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function addIssue(projectId, data) {
  const sheet = getSheet('Issues');
  const id    = makeId();
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, projectId,
    data.title || '', data.description || '',
    data.status || 'open',
    data.status === 'resolved' ? (data.resolution || '') : '',
    data.assignedTo || '', now,
    data.status === 'resolved' ? now : '',
    data.priority || 'medium',
    data.dueDate || ''
  ]);
  updateProjectCounts(projectId);
  return { id };
}

function updateIssue(projectId, issueId, data) {
  const sheet = getSheet('Issues');
  const rows  = sheet.getDataRange().getValues();
  const now   = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === issueId && String(rows[i][1]) === projectId) {
      const wasResolved = rows[i][4] === 'resolved';
      const isResolved  = data.status === 'resolved';
      const updated = [
        issueId, projectId,
        data.title       !== undefined ? data.title       : rows[i][2],
        data.description !== undefined ? data.description : rows[i][3],
        data.status      !== undefined ? data.status      : rows[i][4],
        data.resolution  !== undefined ? (isResolved ? data.resolution : '') : rows[i][5],
        data.assignedTo  !== undefined ? data.assignedTo  : rows[i][6],
        rows[i][7],
        isResolved && !wasResolved ? now : (isResolved ? rows[i][8] : ''),
        data.priority    !== undefined ? data.priority    : (rows[i][9] || 'medium'),
        data.dueDate     !== undefined ? data.dueDate     : cellToDate(rows[i][10])
      ];
      sheet.getRange(i + 1, 1, 1, updated.length).setValues([updated]);
      updateProjectCounts(projectId);
      return { id: issueId };
    }
  }
  throw new Error('Issue not found: ' + issueId);
}

function deleteIssue(projectId, issueId) {
  const sheet = getSheet('Issues');
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === issueId && String(rows[i][1]) === projectId) {
      sheet.getRange(i + 1, 5).setValue('deleted');
      updateProjectCounts(projectId);
      return { id: issueId };
    }
  }
  throw new Error('Issue not found: ' + issueId);
}

function deleteIssuesByProject(projectId) {
  const sheet = getSheet('Issues');
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === projectId) sheet.deleteRow(i + 1);
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────
function rowToNote(row) {
  return {
    id:        String(row[0] || ''),
    projectId: String(row[1] || ''),
    text:      String(row[2] || ''),
    createdAt: cellToTs(row[3])
  };
}

function getNotes(projectId) {
  const sheet = getSheet('Notes');
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .map(rowToNote)
    .filter(n => n.id && n.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function addNote(projectId, text) {
  const sheet = getSheet('Notes');
  const id    = makeId();
  sheet.appendRow([id, projectId, text || '', new Date().toISOString()]);
  return { id };
}

function deleteNote(projectId, noteId) {
  const sheet = getSheet('Notes');
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === noteId && String(rows[i][1]) === projectId) {
      sheet.deleteRow(i + 1);
      return { id: noteId };
    }
  }
  throw new Error('Note not found: ' + noteId);
}

function deleteNotesByProject(projectId) {
  const sheet = getSheet('Notes');
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === projectId) sheet.deleteRow(i + 1);
  }
}

// ── Reports ──────────────────────────────────────────────────────────────────
function getReportData() {
  const projects = getProjects();
  return projects.map(project => ({
    project,
    issues: getIssues(project.id)
  }));
}
