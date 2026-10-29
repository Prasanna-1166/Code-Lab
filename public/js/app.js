// Public page: list, search, filter, view, copy, download.
import { api, copyText, downloadText, el, fileNameFor, renderCode, setupThemeToggle } from "./shared.js";

const $ = (id) => document.getElementById(id);
const state = { programs: [], languages: [], selectedId: null, status: "loading", error: "" };

const langLabel = (id) => state.languages.find((l) => l.id === id)?.label || id;

function readHash() {
  const match = location.hash.match(/^#\/p\/([A-Za-z0-9_-]+)$/);
  state.selectedId = match ? match[1] : null;
}

function filtered() {
  const terms = $("search").value.toLowerCase().split(/\s+/).filter(Boolean);
  const subject = $("subject").value;
  const language = $("language").value;
  return state.programs.filter((p) => {
    if (subject && p.subject !== subject) return false;
    if (language && p.language !== language) return false;
    const haystack = `${p.experimentNumber} experiment ${p.experimentNumber} ${p.title} ${p.description || ""} ${p.subject} ${langLabel(p.language)} ${p.language}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

function fillFilters() {
  const subjects = [...new Set(state.programs.map((p) => p.subject))].sort((a, b) => a.localeCompare(b));
  const languages = [...new Set(state.programs.map((p) => p.language))];
  const subjectSelect = $("subject");
  const languageSelect = $("language");
  const keepSubject = subjectSelect.value;
  const keepLanguage = languageSelect.value;
  subjectSelect.replaceChildren(el("option", { value: "", text: "All subjects" }), ...subjects.map((s) => el("option", { value: s, text: s })));
  languageSelect.replaceChildren(el("option", { value: "", text: "All languages" }), ...languages.map((l) => el("option", { value: l, text: langLabel(l) })));
  subjectSelect.value = subjects.includes(keepSubject) ? keepSubject : "";
  languageSelect.value = languages.includes(keepLanguage) ? keepLanguage : "";
}

function stateBox(title, message, ...actions) {
  return el(
    "div",
    { class: "state" },
    el(
      "div",
      { class: "state-icon", "aria-hidden": "true" },
      el(
        "svg",
        { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", width: "24", height: "24" },
        el("circle", { cx: "12", cy: "12", r: "10" }),
        el("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
        el("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" }),
      ),
    ),
    el("h2", { text: title }),
    el("p", { text: message }),
    ...actions,
  );
}

function renderList() {
  const pane = $("list-pane");
  const clearBtn = $("search-clear");
  const searchVal = $("search").value.trim();
  if (clearBtn) clearBtn.style.display = searchVal ? "block" : "none";

  if (state.status === "loading") {
    pane.replaceChildren(...[1, 2, 3, 4].map(() => el("div", { class: "skeleton" })));
    $("result-count").textContent = "Loading programs";
    const badge = $("result-badge");
    if (badge) badge.textContent = "Loading programs...";
    return;
  }
  if (state.status === "error") {
    pane.replaceChildren(
      el(
        "div",
        { class: "state error", role: "alert" },
        el("h2", { text: "Could not load programs" }),
        el("p", { text: state.error }),
        el("button", { type: "button", class: "btn btn-primary", text: "Try again", onclick: load }),
      ),
    );
    const badge = $("result-badge");
    if (badge) badge.textContent = "Error connecting to library";
    return;
  }
  if (state.programs.length === 0) {
    pane.replaceChildren(stateBox("No programs yet", "An administrator can add the first program from the sign-in link at the bottom of the page."));
    $("result-count").textContent = "No programs";
    const badge = $("result-badge");
    if (badge) badge.textContent = "0 programs in repository";
    return;
  }
  const items = filtered();
  $("result-count").textContent = `${items.length} ${items.length === 1 ? "program" : "programs"} found`;
  const badge = $("result-badge");
  if (badge) badge.textContent = `Showing ${items.length} of ${state.programs.length} experiments`;

  if (items.length === 0) {
    pane.replaceChildren(
      stateBox(
        "Nothing matches",
        "Try a different word, or clear the filters.",
        el("button", {
          type: "button",
          class: "btn",
          text: "Clear search and filters",
          onclick: () => {
            $("search").value = "";
            $("subject").value = "";
            $("language").value = "";
            renderList();
          },
        }),
      ),
    );
    return;
  }
  const groups = new Map();
  for (const p of items) groups.set(p.subject, [...(groups.get(p.subject) || []), p]);
  pane.replaceChildren(
    ...[...groups].map(([subject, list]) =>
      el(
        "div",
        { class: "subject-group" },
        el("h2", { text: subject }),
        el(
          "ul",
          {},
          ...list.map((p) =>
            el(
              "li",
              {},
              el(
                "a",
                { class: "exp", href: `#/p/${p.id}`, "aria-current": p.id === state.selectedId ? "true" : null },
                el("span", { class: "exp-num", "aria-hidden": "true", text: String(p.experimentNumber) }),
                el(
                  "div",
                  { class: "exp-content" },
                  el("span", { class: "sr-only", text: `Experiment ${p.experimentNumber}: ` }),
                  el("span", { class: "exp-title", text: p.title }),
                  el(
                    "div",
                    { class: "exp-meta" },
                    el(
                      "span",
                      { class: "chip", "data-lang": p.language },
                      el("span", { class: "chip-dot" }),
                      document.createTextNode(langLabel(p.language)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderViewer() {
  const pane = $("viewer-pane");
  const layout = $("layout");
  layout.classList.toggle("viewing", Boolean(state.selectedId));
  const back = el("a", { class: "btn back-link", href: "#", text: "Back to list" });

  if (state.status !== "ready") {
    pane.replaceChildren();
    return;
  }
  if (!state.selectedId) {
    pane.replaceChildren(
      stateBox(
        "Pick an experiment",
        "Choose any program from the list on the left to inspect, copy, or download its source code.",
      ),
    );
    return;
  }
  const p = state.programs.find((x) => x.id === state.selectedId);
  if (!p) {
    pane.replaceChildren(
      back,
      stateBox("Program not found", "It may have been removed or renamed. Choose another experiment from the list."),
    );
    return;
  }

  const status = el("span", { class: "copy-status", role: "status", "aria-live": "polite" });
  const copyBtn = el("button", {
    type: "button",
    class: "btn btn-primary",
    text: "Copy code",
  });
  let timer;
  copyBtn.addEventListener("click", async () => {
    const ok = await copyText(p.code);
    status.className = `copy-status ${ok ? "ok" : "fail"}`;
    status.textContent = ok ? "Copied to clipboard" : "Copy failed. Select the code and press Ctrl+C.";
    clearTimeout(timer);
    timer = setTimeout(() => {
      status.textContent = "";
    }, 3500);
  });
  const downloadBtn = el("button", {
    type: "button",
    class: "btn",
    text: "Download file",
    onclick: () => downloadText(fileNameFor(p, state.languages), p.code),
  });

  const gutter = el("pre", { class: "gutter", "aria-hidden": "true" });
  const code = el("code");
  const lines = renderCode(code, gutter, p.code, p.language);

  const listing = el("div", { class: "listing", tabindex: "0", role: "region", "aria-label": "Source code" }, gutter, el("pre", {}, code));
  const wrapBtn = el("button", {
    type: "button",
    class: "btn btn-small",
    text: "Wrap lines",
    onclick: (e) => {
      const isWrapped = listing.classList.toggle("wrapped");
      e.target.textContent = isWrapped ? "Unwrap lines" : "Wrap lines";
    },
  });

  pane.replaceChildren(
    back,
    el(
      "article",
      { class: "viewer" },
      el(
        "header",
        { class: "viewer-head" },
        el("p", { class: "kicker", text: `${p.subject} • Experiment ${p.experimentNumber}` }),
        el("h2", { text: p.title }),
        p.description ? el("p", { class: "desc", text: p.description }) : null,
      ),
      el("div", { class: "toolbar" }, el("div", { class: "toolbar-buttons" }, copyBtn, downloadBtn, wrapBtn), status),
      el(
        "div",
        { class: "file-tab" },
        el(
          "div",
          { class: "file-tab-name" },
          el(
            "div",
            { class: "window-dots", "aria-hidden": "true" },
            el("span", { class: "window-dot dot-red" }),
            el("span", { class: "window-dot dot-yellow" }),
            el("span", { class: "window-dot dot-green" }),
          ),
          el("span", { text: fileNameFor(p, state.languages) }),
        ),
        el(
          "div",
          { class: "file-tab-meta" },
          el("span", { text: `${langLabel(p.language)} • ${lines} ${lines === 1 ? "line" : "lines"}` }),
        ),
      ),
      listing,
    ),
  );
  document.title = `${p.title} (${p.subject} Exp ${p.experimentNumber}) | Lab Code Library`;
}

function render() {
  renderList();
  renderViewer();
  if (!state.selectedId) document.title = "Lab Code Library";
}

async function load() {
  state.status = "loading";
  render();
  try {
    const data = await api("/programs");
    state.programs = data.programs;
    state.languages = data.languages;
    state.status = "ready";
    fillFilters();
  } catch (err) {
    state.status = "error";
    state.error = err.message;
  }
  render();
}

setupThemeToggle($("theme-toggle"));
for (const id of ["search", "subject", "language"]) $(id).addEventListener("input", renderList);

const clearBtn = $("search-clear");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    $("search").value = "";
    $("search").focus();
    renderList();
  });
}

// Global keyboard shortcut: / to search, Escape to blur/clear
window.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
    e.preventDefault();
    $("search").focus();
  } else if (e.key === "Escape" && document.activeElement === $("search")) {
    if ($("search").value) {
      $("search").value = "";
      renderList();
    } else {
      $("search").blur();
    }
  }
});

window.addEventListener("hashchange", () => {
  readHash();
  render();
  if (state.selectedId) $("viewer-pane").scrollIntoView({ block: "start" });
});

readHash();
load();
