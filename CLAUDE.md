# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

Remote: https://github.com/auntanveer/team-portal (GitHub account: `auntanveer`)
All work should be committed and pushed to this repo to maintain version history.

## Project Overview

A team project management portal hosted on GitHub Pages. No build system — all files are static and open directly in a browser. Data is stored in Google Sheets via a Google Apps Script Web App backend.

Live URL: `https://auntanveer.github.io/team-portal/`

## File Structure

- `index.html` — All views and HTML structure
- `style.css` — Styling (light theme, purple/blue gradient palette, fully mobile responsive)
- `app.js` — All frontend logic, routing, rendering
- `sheets-config.js` — API helper functions (`apiGet`, `apiPost`) and all backend calls
- `apps-script.gs` — Google Apps Script backend (must be manually pasted into Google Apps Script and redeployed after changes)

## Architecture

### Frontend (GitHub Pages)
Static files served from GitHub. No framework, no build step.

### Backend (Google Apps Script)
- Deployed as a Web App — URL stored in `sheets-config.js` as `SCRIPT_URL`
- After any change to `apps-script.gs`, it must be manually redeployed:
  `Extensions → Apps Script → Deploy → Manage deployments → Edit → New version → Deploy`

### Database (Google Sheets)
Three sheets: `Projects`, `Issues`, `Notes`

**Projects columns:** `id, name, description, startDate, endDate, status, resources, createdAt, openIssues, resolvedIssues`
- `status` values: `active`, `on-hold`, `completed`, `deleted` (soft delete)
- `resources` is comma-separated team member names
- Rows pasted from Excel without an `id` get auto-assigned one on next dashboard load

**Issues columns:** `id, projectId, title, description, status, resolution, assignedTo, createdAt, resolvedAt, priority, dueDate`
- `status` values: `open`, `resolved`, `deleted` (soft delete)
- `priority` values: `high`, `medium`, `low`

**Notes columns:** `id, projectId, text, createdAt`

## Views (Routing)

Hash-based routing via `showView(name)`. Views:

| Hash | View ID | Description |
|---|---|---|
| `#dashboard` | `view-dashboard` | Project cards + stats |
| `#project-detail` | `view-project-detail` | Issues + notes for one project |
| `#project-form` | `view-project-form` | Add / edit project |
| `#issue-form` | `view-issue-form` | Add / edit issue |
| `#issues-report` | `view-issues-report` | All issues across projects (filterable table) |
| `#reports` | `view-reports` | Charts and analytics |
| `#trash` | `view-trash` | Deleted projects and issues with Restore |

## Key Behaviours

### Dashboard stats
Shows: **Active**, **Completed**, **Deleted** (project counts). Deleted tile is clickable → opens Trash view.

### Issues tab stats
Shows: **Open**, **Resolved**, **Deleted** (issue counts across all projects).

### Soft Delete & Restore
Deleting a project sets `status = 'deleted'` and cascades to all its issues. Deleting an issue sets `status = 'deleted'`. Both are excluded from all normal views. The Trash view lists all deleted items with a **Restore** button. Restoring a project also restores all its issues.

### Issue counts on project cards
Counts are calculated live from the Issues sheet on every `getProjects()` call — not cached in the Projects sheet — so they are always accurate.

### Pasting projects from Excel
Paste into columns B–G of the Projects sheet (name, description, startDate, endDate, status, resources). Leave column A blank — IDs are auto-generated on the next dashboard load.

## State (`app.js`)

```
state.currentView       — active view name
state.currentProjectId  — project open in detail view
state.editingProjectId  — project being edited in form
state.editingIssueId    — issue being edited in form
state.issueFilter       — 'all' | 'open' | 'resolved'
state.allProjects       — cached project list for dashboard filtering
state.cachedIssues      — issues for current project detail
state.reportData        — data for charts/issues report
state.charts            — Chart.js instances (destroyed on re-render)
```

## Key Functions (`app.js`)

- `loadDashboard()` — fetches projects + deleted counts, renders cards and stats
- `loadProjectDetail(id)` — fetches project, issues, notes in parallel
- `loadIssuesReport()` — fetches report data + deleted counts, renders stats + table
- `loadReports()` — fetches report data, renders charts
- `loadTrash()` — fetches deleted items, renders restore UI
- `renderIssuesReportTable()` — filters and renders the issues table (called on filter change, no re-fetch)
- `autoFillMissingIds()` — runs in Apps Script on every `getProjects()` to assign IDs to pasted rows
