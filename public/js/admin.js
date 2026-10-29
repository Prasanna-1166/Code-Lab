// Admin page: sign in, add / edit / delete programs.
// The server re-checks everything; hiding this page's buttons is not the security.
import { ApiError, api, el, setupThemeToggle } from "./shared.js";

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "lcl-admin-token";
const FIELDS = ["subject", "experimentNumber", "title", "language", "description", "code"];

const state = { token: null, programs: [], languages: [], limits: { maxCodeBytes: 512000 }, editing: null };

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
  $("password").focus();
}

function showAdmin() {
  $("login-view").hidden = true;
  $("admin-view").hidden = false;
  $("logout").hidden = false;
}

// Returns true if the error was an expired session (and we went back to the login screen).
function handleAuth(err) {
  if (err instanceof ApiError && err.status === 401) {
    showLogin("Your session expired. Sign in again.");
    return true;
  }
  return false;
}

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
    if (bytes > max) {
      sizeBox.style.color = "var(--danger)";
    } else {
      sizeBox.style.color = "";
    }
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
  $("file-hint").textContent = `Allowed: ${state.languages.map((l) => "." + l.ext).join(", ")}. Up to ${Math.round(state.limits.maxCodeBytes / 1024)} KB. The code will load below for your review.`;
  const subjects = [...new Set(state.programs.map((p) => p.subject))].sort((a, b) => a.localeCompare(b));
  $("subject-list").replaceChildren(...subjects.map((s) => el("option", { value: s })));
}

function renderExisting() {
  const box = $("existing");
  const countBadge = $("existing-count");
  if (countBadge) {
    countBadge.textContent = `${state.programs.length} ${state.programs.length === 1 ? "Program" : "Programs"}`;
  }

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
  const data = await api("/programs");
  state.programs = data.programs;
  state.languages = data.languages;
  state.limits = data.limits;
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

  // Auto-detect experiment number from filename if available (e.g. exp1 or lab-2)
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
    const result = await api(editing ? `/programs/${editing.id}` : "/programs", { method: editing ? "PUT" : "POST", body, token: state.token });
    await loadPrograms();
    resetForm();
    notice($("form-notice"), "ok", `${editing ? "Saved changes to" : "Added"} ${result.program.subject}, Experiment ${result.program.experimentNumber}: ${result.program.title}.`);
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

async function init() {
  setupThemeToggle($("theme-toggle"));
  $("login-form").addEventListener("submit", onLogin);
  $("program-form").addEventListener("submit", onSave);
  $("f-file").addEventListener("change", onFile);
  $("f-code").addEventListener("input", updateCodeSize);

  // Tab key indent in textarea
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
  $("logout").addEventListener("click", () => showLogin(""));

  try {
    await loadPrograms();
  } catch (err) {
    notice($("form-notice"), "error", err.message);
  }

  if (!state.token) return showLogin("");
  try {
    await api("/session", { token: state.token });
    showAdmin();
  } catch (err) {
    showLogin(err.status === 401 ? "Your session expired. Sign in again." : err.message);
  }
}

init();
