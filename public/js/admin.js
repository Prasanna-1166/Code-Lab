// Admin page: authentication wall, visitor analytics dashboard, and code management.
import { ApiError, api, downloadText, el, setupThemeToggle } from "./shared.js";

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "lcl-admin-token";
const FIELDS = ["subject", "experimentNumber", "title", "language", "description", "code"];

const ALL_LANGUAGES = [
  { id: "c", label: "C", ext: "c" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "java", label: "Java", ext: "java" },
  { id: "python", label: "Python", ext: "py" },
  { id: "dart", label: "Dart", ext: "dart" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "text", label: "Plain text", ext: "txt" },
];

const state = {
  token: null,
  programs: [],
  languages: [...ALL_LANGUAGES],
  limits: { maxCodeBytes: 512000 },
  editing: null,
  activeTab: "analytics",
  analyticsData: null,
};

try {
  state.token = sessionStorage.getItem(TOKEN_KEY);
} catch {
  /* storage blocked: sign in each time */
}

const saveToken = (token) => {
  state.token = token;
  try {
    token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

function notice(node, kind, text) {
  if (!node) return;
  node.hidden = !text;
  node.className = `notice ${kind}`;
  node.textContent = text || "";
}

function showLogin(message) {
  saveToken(null);
  $("admin-view").hidden = true;
  $("logout").hidden = true;
  $("login-view").hidden = false;
  notice($("login-notice"), "error", message);
  $("password").value = "";
  $("password").focus();
}

function showAdmin() {
  $("login-view").hidden = true;
  $("admin-view").hidden = false;
  $("logout").hidden = false;
  loadAnalytics();
  loadPrograms();
}

// Returns true if the error was an expired session
function handleAuth(err) {
  if (err instanceof ApiError && err.status === 401) {
    showLogin("Your session expired or is invalid. Please sign in again.");
    return true;
  }
  return false;
}

function switchTab(tabName) {
  state.activeTab = tabName;
  const isAnalytics = tabName === "analytics";

  $("tab-btn-analytics").classList.toggle("active", isAnalytics);
  $("tab-btn-analytics").setAttribute("aria-selected", String(isAnalytics));
  $("panel-analytics").hidden = !isAnalytics;

  $("tab-btn-programs").classList.toggle("active", !isAnalytics);
  $("tab-btn-programs").setAttribute("aria-selected", String(!isAnalytics));
  $("panel-programs").hidden = isAnalytics;

  if (isAnalytics) {
    loadAnalytics();
  }
}

/* ==========================================================================
   Analytics Dashboard
   ========================================================================== */

function formatRelativeTime(isoString) {
  try {
    const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    const d = new Date(isoString);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return isoString || "Recently";
  }
}

async function loadAnalytics() {
  if (!state.token) return;
  try {
    const data = await api("/analytics", { token: state.token });
    state.analyticsData = data;
    renderAnalytics(data);
  } catch (err) {
    if (handleAuth(err)) return;
    console.warn("Could not load analytics:", err.message);
  }
}

function renderAnalytics(data) {
  if (!data) return;

  // 1. KPI Cards
  $("kpi-total-views").textContent = Number(data.totalVisits || 0).toLocaleString();
  $("kpi-unique-visitors").textContent = Number(data.uniqueVisitors || 0).toLocaleString();
  $("kpi-today-views").textContent = Number(data.todayVisits || 0).toLocaleString();
  $("kpi-today-uniques").textContent = `${data.todayUniques || 0} unique today`;
  $("kpi-total-programs").textContent = data.totalPrograms || state.programs.length;
  $("kpi-total-subjects").textContent = `${data.totalSubjects || 0} subjects covered`;

  // 2. Timeline Bar Chart (14 Days)
  const chartContainer = $("chart-bars-container");
  if (chartContainer && Array.isArray(data.timeline)) {
    const maxVisits = Math.max(1, ...data.timeline.map((d) => d.visits));
    chartContainer.replaceChildren(
      ...data.timeline.map((day) => {
        const heightPct = Math.max(4, Math.round((day.visits / maxVisits) * 100));
        const dateParts = day.date.split("-");
        const dateFormatted = `${Number(dateParts[1])}/${Number(dateParts[2])}`;

        return el(
          "div",
          { class: "chart-col" },
          el(
            "div",
            { class: "chart-tooltip" },
            `${day.date}: ${day.visits} visits (${day.uniques} unique)`,
          ),
          el(
            "div",
            { class: "chart-bar-bg" },
            el("div", {
              class: "chart-bar",
              style: `height: ${heightPct}%;`,
              title: `${day.date}: ${day.visits} visits (${day.uniques} unique)`,
            }),
          ),
          el("span", { class: "chart-date-lbl", text: dateFormatted }),
        );
      }),
    );
  }

  // 3. Top Viewed Lab Programs Table
  const topTable = $("top-programs-table-body");
  if (topTable) {
    const topList = data.topPrograms || [];
    if (topList.length === 0) {
      topTable.replaceChildren(
        el("tr", {}, el("td", { colspan: "4", style: "text-align: center; color: var(--text-muted); padding: 1.5rem;" }, "No program views recorded yet. Visitor views will appear here.")),
      );
    } else {
      const maxViews = Math.max(1, ...topList.map((p) => p.views));
      topTable.replaceChildren(
        ...topList.map((p, idx) => {
          const rank = idx + 1;
          const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "";
          const barWidth = Math.max(8, Math.round((p.views / maxViews) * 100));

          return el(
            "tr",
            {},
            el("td", {}, el("span", { class: `rank-badge ${rankClass}`, text: String(rank) })),
            el(
              "td",
              {},
              el(
                "div",
                { class: "prog-info-cell" },
                el("span", { class: "prog-name", text: p.title }),
                el("span", { class: "prog-sub", text: `${p.subject}${p.experimentNumber ? ` • Exp ${p.experimentNumber}` : ""}` }),
              ),
            ),
            el("td", {}, el("span", { class: "chip", text: p.language || "code" })),
            el(
              "td",
              {},
              el(
                "div",
                { class: "view-bar-wrap" },
                el("div", { class: "view-bar-track" }, el("div", { class: "view-bar-fill", style: `width: ${barWidth}%;` })),
                el("span", { class: "view-count-text", text: String(p.views) }),
              ),
            ),
          );
        }),
      );
    }
  }

  // 4. Device Platform Breakdown
  const deviceList = $("device-breakdown-list");
  if (deviceList) {
    const counts = data.deviceCounts || { Desktop: 0, Mobile: 0, Tablet: 0 };
    const totalDevices = (counts.Desktop || 0) + (counts.Mobile || 0) + (counts.Tablet || 0) || 1;

    const devices = [
      { name: "Desktop", count: counts.Desktop || 0 },
      { name: "Mobile", count: counts.Mobile || 0 },
      { name: "Tablet", count: counts.Tablet || 0 },
    ];

    deviceList.replaceChildren(
      ...devices.map((d) => {
        const pct = Math.round((d.count / totalDevices) * 100);
        return el(
          "div",
          { class: "breakdown-row" },
          el(
            "div",
            { class: "breakdown-meta" },
            el("span", { class: "breakdown-name", text: d.name }),
            el("span", { style: "font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);", text: `${d.count} (${pct}%)` }),
          ),
          el("div", { class: "breakdown-track" }, el("div", { class: "breakdown-fill", style: `width: ${pct}%;` })),
        );
      }),
    );
  }

  // 5. Recent Activity Feed
  const recentTable = $("recent-activity-table-body");
  if (recentTable) {
    const recent = data.recentVisits || [];
    if (recent.length === 0) {
      recentTable.replaceChildren(
        el("tr", {}, el("td", { colspan: "3", style: "text-align: center; color: var(--text-muted); padding: 1.5rem;" }, "No recent visitor activity recorded yet.")),
      );
    } else {
      recentTable.replaceChildren(
        ...recent.slice(0, 15).map((v) => {
          let label = "Home Library";
          if (v.experimentId) {
            const p = state.programs.find((x) => x.id === v.experimentId);
            label = p ? `${p.subject}: ${p.title}` : `Experiment #${v.experimentId}`;
          } else if (v.path && v.path !== "/") {
            label = v.path;
          }

          return el(
            "tr",
            {},
            el("td", { style: "font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);", text: formatRelativeTime(v.timestamp) }),
            el("td", { style: "font-weight: 500;", text: label }),
            el("td", {}, el("span", { class: "device-badge", text: v.device || "Desktop" })),
          );
        }),
      );
    }
  }
}

/* ==========================================================================
   Program Management (Add, Edit, Delete)
   ========================================================================== */

function clearFieldErrors() {
  for (const name of [...FIELDS, "file"]) {
    const box = $(`e-${name}`);
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
    const input = $(`f-${name}`);
    if (input) input.removeAttribute("aria-invalid");
  }
}

function showFieldErrors(fields) {
  let first = true;
  for (const [name, message] of Object.entries(fields || {})) {
    const box = $(`e-${name}`);
    const input = $(`f-${name}`);
    if (!box || !input) continue;
    box.textContent = message;
    box.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", box.id);
    if (first) {
      input.focus();
      first = false;
    }
  }
}

function updateCodeSize() {
  const bytes = new TextEncoder().encode($("f-code").value).length;
  const max = state.limits.maxCodeBytes;
  const kb = (bytes / 1024).toFixed(1);
  const maxKb = Math.round(max / 1024);
  const sizeBox = $("code-size");
  if (sizeBox) {
    sizeBox.textContent = `${kb} KB of ${maxKb} KB used`;
    sizeBox.style.color = bytes > max ? "var(--danger)" : "";
  }
}

function fillSelects() {
  const select = $("f-language");
  const current = select.value;
  select.replaceChildren(
    el("option", { value: "", text: "Choose a language" }),
    ...state.languages.map((l) => el("option", { value: l.id, text: `${l.label} (.${l.ext})` })),
  );
  select.value = current;
  $("file-hint").textContent = `Allowed: ${state.languages.map((l) => "." + l.ext).join(", ")}. Up to ${Math.round(state.limits.maxCodeBytes / 1024)} KB. Text loads below for review.`;
  const subjects = [...new Set(state.programs.map((p) => p.subject))].sort((a, b) => a.localeCompare(b));
  $("subject-list").replaceChildren(...subjects.map((s) => el("option", { value: s })));
}

function renderExisting() {
  const box = $("existing");
  if (state.programs.length === 0) {
    box.replaceChildren(el("p", { class: "hint", text: "No programs yet. Add the first one above." }));
    return;
  }
  const groups = new Map();
  for (const p of state.programs) groups.set(p.subject, [...(groups.get(p.subject) || []), p]);
  box.replaceChildren(
    ...[...groups].map(([subject, list]) =>
      el(
        "div",
        { class: "admin-group" },
        el("h3", { text: `${subject} (${list.length})` }),
        ...list.map((p) =>
          el(
            "div",
            { class: "admin-row" },
            el("span", { class: "num", text: String(p.experimentNumber) }),
            el("span", {}, el("span", { class: "sr-only", text: `Experiment ${p.experimentNumber}: ` }), p.title),
            el("span", { class: "chip", text: state.languages.find((l) => l.id === p.language)?.label || p.language }),
            el(
              "span",
              { class: "actions" },
              el("button", {
                type: "button",
                class: "btn btn-small",
                text: "Edit",
                "aria-label": `Edit ${p.subject} experiment ${p.experimentNumber}`,
                onclick: () => startEdit(p),
              }),
              el("button", {
                type: "button",
                class: "btn btn-small btn-danger",
                text: "Delete",
                "aria-label": `Delete ${p.subject} experiment ${p.experimentNumber}`,
                onclick: () => confirmDelete(p),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}

function resetForm() {
  $("program-form").reset();
  $("f-file").value = "";
  state.editing = null;
  $("form-title").textContent = "Add a program";
  $("save-btn").textContent = "Save program";
  $("cancel-edit").hidden = true;
  clearFieldErrors();
  updateCodeSize();
}

function startEdit(p) {
  state.editing = p;
  clearFieldErrors();
  notice($("form-notice"), "ok", "");
  $("f-subject").value = p.subject;
  $("f-experimentNumber").value = p.experimentNumber;
  $("f-title").value = p.title;
  $("f-language").value = p.language;
  $("f-description").value = p.description || "";
  $("f-code").value = p.code;
  $("form-title").textContent = `Edit ${p.subject}, Experiment ${p.experimentNumber}`;
  $("save-btn").textContent = "Save changes";
  $("cancel-edit").hidden = false;
  updateCodeSize();
  $("form-title").scrollIntoView({ block: "start", behavior: "smooth" });
  $("f-title").focus();
}

async function loadPrograms() {
  try {
    const data = await api("/programs");
    state.programs = data.programs || [];
    if (data.languages && data.languages.length > 0) {
      state.languages = data.languages;
    }
    state.limits = data.limits || { maxCodeBytes: 512000 };
  } catch (err) {
    if (handleAuth(err)) return;
    notice($("form-notice"), "error", err.message);
  }
  fillSelects();
  renderExisting();
  updateCodeSize();
}

async function onFile(event) {
  const file = event.target.files[0];
  const errorBox = $("e-file");
  errorBox.hidden = true;
  if (!file) return;
  const fail = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    event.target.value = "";
  };
  const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
  const language = state.languages.find((l) => l.ext === ext);
  if (!language) return fail(`".${ext}" files are not supported. Allowed: ${state.languages.map((l) => "." + l.ext).join(", ")}.`);
  if (file.size > state.limits.maxCodeBytes) return fail(`That file is ${(file.size / 1024).toFixed(0)} KB. The limit is ${Math.round(state.limits.maxCodeBytes / 1024)} KB.`);
  let text;
  try {
    text = await file.text();
  } catch {
    return fail("The file could not be read.");
  }
  if (text.includes("\u0000") || text.includes("\uFFFD")) return fail("This does not look like a plain-text file, so it was not loaded.");
  $("f-code").value = text;
  if (!$("f-language").value) $("f-language").value = language.id;
  if (!$("f-title").value) $("f-title").value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");

  if (!$("f-experimentNumber").value) {
    const numMatch = file.name.match(/(?:exp|experiment|lab)[\s_-]*(\d+)/i);
    if (numMatch) $("f-experimentNumber").value = numMatch[1];
  }

  updateCodeSize();
  notice($("form-notice"), "ok", `Loaded ${file.name}. Review and edit the code below, then save.`);
}

async function onSave(event) {
  event.preventDefault();
  clearFieldErrors();
  notice($("form-notice"), "ok", "");

  const body = {
    subject: $("f-subject").value,
    experimentNumber: $("f-experimentNumber").value,
    title: $("f-title").value,
    language: $("f-language").value,
    description: $("f-description").value,
    code: $("f-code").value,
  };
  const editing = state.editing;
  if (editing) body.expectedUpdatedAt = editing.updatedAt;

  $("save-btn").disabled = true;

  try {
    const result = await api(editing ? `/programs/${editing.id}` : "/programs", {
      method: editing ? "PUT" : "POST",
      body,
      token: state.token,
    });
    await loadPrograms();
    resetForm();
    notice($("form-notice"), "ok", `${editing ? "Saved changes to" : "Added"} ${result.program.subject}, Experiment ${result.program.experimentNumber}: ${result.program.title}.`);
    // Refresh analytics after adding or editing programs
    loadAnalytics();
  } catch (err) {
    if (handleAuth(err)) return;
    showFieldErrors(err.fields);
    notice($("form-notice"), "error", err.message);
    if (err.status === 409 && !err.fields?.experimentNumber) await loadPrograms().catch(() => {});
  } finally {
    $("save-btn").disabled = false;
  }
}

function confirmDelete(p) {
  const dialog = $("confirm-dialog");
  $("confirm-text").textContent = `${p.subject}, Experiment ${p.experimentNumber}: ${p.title}. This cannot be undone.`;
  dialog.returnValue = "";
  dialog.addEventListener("close", async function onClose() {
    dialog.removeEventListener("close", onClose);
    if (dialog.returnValue !== "delete") return;
    try {
      await api(`/programs/${p.id}`, { method: "DELETE", token: state.token });
      if (state.editing?.id === p.id) resetForm();
      await loadPrograms();
      loadAnalytics();
      notice($("form-notice"), "ok", `Deleted ${p.subject}, Experiment ${p.experimentNumber}.`);
    } catch (err) {
      if (handleAuth(err)) return;
      notice($("form-notice"), "error", err.message);
      await loadPrograms().catch(() => {});
    }
  });
  dialog.showModal();
}

async function onLogin(event) {
  event.preventDefault();
  notice($("login-notice"), "error", "");
  $("login-btn").disabled = true;
  try {
    const { token } = await api("/login", { method: "POST", body: { password: $("password").value } });
    $("password").value = "";
    saveToken(token);
    showAdmin();
  } catch (err) {
    notice($("login-notice"), "error", err.message);
  } finally {
    $("login-btn").disabled = false;
  }
}

function setupExportImport() {
  const exportBtn = $("export-json-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const jsonContent = JSON.stringify({ version: 1, programs: state.programs }, null, 2);
      downloadText("lab-programs-export.json", jsonContent);
    });
  }

  const importFile = $("import-json-file");
  if (importFile) {
    importFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const content = await file.text();
        const parsed = JSON.parse(content);
        if (!parsed || !Array.isArray(parsed.programs)) {
          alert("Invalid JSON format: missing 'programs' array.");
          return;
        }
        if (confirm(`Import ${parsed.programs.length} programs from this file? This will upload them to the repository.`)) {
          for (const item of parsed.programs) {
            try {
              await api("/programs", { method: "POST", body: item, token: state.token });
            } catch {
              /* ignore individual duplicates during import */
            }
          }
          await loadPrograms();
          loadAnalytics();
          notice($("form-notice"), "ok", `Import finished for ${parsed.programs.length} programs.`);
        }
      } catch (err) {
        alert("Failed to parse JSON file: " + err.message);
      } finally {
        e.target.value = "";
      }
    });
  }
}

async function init() {
  setupThemeToggle($("theme-toggle"));
  $("login-form").addEventListener("submit", onLogin);
  $("program-form").addEventListener("submit", onSave);
  $("f-file").addEventListener("change", onFile);
  $("f-code").addEventListener("input", updateCodeSize);

  // Tab key indentation in textarea
  $("f-code").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + "    " + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 4;
      updateCodeSize();
    }
  });

  $("cancel-edit").addEventListener("click", resetForm);
  $("logout").addEventListener("click", () => showLogin("You have been signed out."));
  $("tab-btn-analytics").addEventListener("click", () => switchTab("analytics"));
  $("tab-btn-programs").addEventListener("click", () => switchTab("programs"));
  $("refresh-analytics-btn").addEventListener("click", () => loadAnalytics());

  setupExportImport();

  // Strict session check: only verified sessions enter
  if (!state.token) {
    showLogin("");
    return;
  }

  try {
    await api("/session", { token: state.token });
    showAdmin();
  } catch {
    showLogin("Your session expired. Sign in again.");
  }
}

init();
