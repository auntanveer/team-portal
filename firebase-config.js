// STEP 1: Replace this config with your own from Firebase Console
// Firebase Console → Project Settings → Your Apps → Web → firebaseConfig
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ─── Projects ────────────────────────────────────────────────────────────────

async function getProjects() {
  const snap = await db.collection('projects').orderBy('createdAt', 'desc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getProject(projectId) {
  const doc = await db.collection('projects').doc(projectId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function addProject(data) {
  return db.collection('projects').add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function updateProject(projectId, data) {
  return db.collection('projects').doc(projectId).update(data);
}

async function deleteProject(projectId) {
  // Firestore does not cascade-delete subcollections — delete issues first
  const issues = await getIssues(projectId);
  const batch = db.batch();
  issues.forEach(issue => {
    const ref = db.collection('projects').doc(projectId)
                  .collection('issues').doc(issue.id);
    batch.delete(ref);
  });
  await batch.commit();
  return db.collection('projects').doc(projectId).delete();
}

// ─── Issues ──────────────────────────────────────────────────────────────────

async function getIssues(projectId) {
  const snap = await db.collection('projects').doc(projectId)
    .collection('issues').orderBy('createdAt', 'asc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function addIssue(projectId, data) {
  return db.collection('projects').doc(projectId).collection('issues').add({
    ...data,
    resolvedAt: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function updateIssue(projectId, issueId, data) {
  if (data.status === 'resolved' && !data.resolvedAt) {
    data.resolvedAt = firebase.firestore.FieldValue.serverTimestamp();
  } else if (data.status === 'open') {
    data.resolvedAt = null;
  }
  return db.collection('projects').doc(projectId)
    .collection('issues').doc(issueId).update(data);
}

async function deleteIssue(projectId, issueId) {
  return db.collection('projects').doc(projectId)
    .collection('issues').doc(issueId).delete();
}

// ─── Reports ─────────────────────────────────────────────────────────────────

async function getReportData() {
  const projects = await getProjects();
  const issueArrays = await Promise.all(projects.map(p => getIssues(p.id)));
  return projects.map((project, i) => ({ project, issues: issueArrays[i] }));
}
