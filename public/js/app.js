// Public page: list, search, filter, view, copy, download.
import { api, copyText, downloadText, el, fileNameFor, renderCode, setupThemeToggle } from "./shared.js";

const $ = (id) => document.getElementById(id);

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

const CANONICAL_PROGRAMS = [
  {
    id: "sample-ds-1",
    subject: "Data Structures",
    experimentNumber: 1,
    title: "Stack using an array",
    language: "c",
    description: "Push, pop and display on a fixed-size stack.",
    code: `#include <stdio.h>\n#define MAX 5\n\nint stack[MAX];\nint top = -1;\n\nvoid push(int value) {\n    if (top == MAX - 1) {\n        printf("Stack overflow\\n");\n        return;\n    }\n    stack[++top] = value;\n}\n\nint pop(void) {\n    if (top == -1) {\n        printf("Stack underflow\\n");\n        return -1;\n    }\n    return stack[top--];\n}\n\nint main(void) {\n    push(10);\n    push(20);\n    push(30);\n    printf("Popped: %d\\n", pop());\n    printf("Popped: %d\\n", pop());\n    return 0;\n}\n`,
  },
  {
    id: "sample-py-1",
    subject: "Python Programming",
    experimentNumber: 1,
    title: "Binary search",
    language: "python",
    description: "Search a sorted list in O(log n) steps.",
    code: `def binary_search(items, target):\n    low, high = 0, len(items) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\n\nnumbers = [3, 8, 15, 23, 42, 57, 91]\nprint("Index of 23:", binary_search(numbers, 23))\nprint("Index of 10:", binary_search(numbers, 10))\n`,
  },
  {
    id: "sample-db-1",
    subject: "Database Management",
    experimentNumber: 1,
    title: "Create tables and join them",
    language: "sql",
    description: "Two related tables and an INNER JOIN.",
    code: `-- Students and the department each one belongs to\nCREATE TABLE department (\n    dept_id   INT PRIMARY KEY,\n    dept_name VARCHAR(50) NOT NULL\n);\n\nCREATE TABLE student (\n    roll_no INT PRIMARY KEY,\n    name    VARCHAR(80) NOT NULL,\n    dept_id INT,\n    FOREIGN KEY (dept_id) REFERENCES department(dept_id)\n);\n\nINSERT INTO department VALUES (1, 'Computer Science'), (2, 'Electronics');\nINSERT INTO student VALUES (101, 'Asha', 1), (102, 'Ravi', 2);\n\nSELECT s.roll_no, s.name, d.dept_name\nFROM student s\nINNER JOIN department d ON s.dept_id = d.dept_id\nORDER BY s.roll_no;\n`,
  },
  {
    id: "sample-oop-1",
    subject: "Object-Oriented Programming",
    experimentNumber: 1,
    title: "Inheritance and method overriding",
    language: "java",
    description: "A Dog class that extends Animal and overrides speak().",
    code: `class Animal {\n    void speak() {\n        System.out.println("The animal makes a sound");\n    }\n}\n\nclass Dog extends Animal {\n    @Override\n    void speak() {\n        System.out.println("The dog barks");\n    }\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Animal pet = new Dog();\n        pet.speak();\n    }\n}\n`,
  },
  {
    id: "sample-mad-1",
    subject: "Mobile App Development",
    experimentNumber: 1,
    title: "Counter app",
    language: "dart",
    description: "A Flutter screen with a button that increments a counter.",
    code: `import 'package:flutter/material.dart';\n\nvoid main() => runApp(const CounterApp());\n\nclass CounterApp extends StatefulWidget {\n  const CounterApp({super.key});\n\n  @override\n  State<CounterApp> createState() => _CounterAppState();\n}\n\nclass _CounterAppState extends State<CounterApp> {\n  int _count = 0;\n\n  @override\n  Widget build(BuildContext context) {\n    return MaterialApp(\n      home: Scaffold(\n        appBar: AppBar(title: const Text('Counter')),\n        body: Center(child: Text('Count: $_count')),\n        floatingActionButton: FloatingActionButton(\n          onPressed: () => setState(() => _count++),\n          child: const Icon(Icons.add),\n        ),\n      ),\n    );\n  }\n}\n`,
  },
  {
    id: "sample-web-1",
    subject: "Web Technologies",
    experimentNumber: 1,
    title: "Form validation",
    language: "html",
    description: "Check that a name and an email are filled in before submitting.",
    code: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Form validation</title>\n</head>\n<body>\n  <form id="signup">\n    <input id="name" placeholder="Name">\n    <input id="email" placeholder="Email">\n    <button type="submit">Register</button>\n    <p id="message"></p>\n  </form>\n\n  <script>\n    document.getElementById("signup").addEventListener("submit", function (event) {\n      event.preventDefault();\n      var name = document.getElementById("name").value.trim();\n      var email = document.getElementById("email").value.trim();\n      var message = document.getElementById("message");\n      if (name === "" || email.indexOf("@") === -1) {\n        message.textContent = "Enter a name and a valid email.";\n      } else {\n        message.textContent = "Welcome, " + name + "!";\n      }\n    });\n  </script>\n</body>\n</html>\n`,
  },
];

const state = {
  programs: [...CANONICAL_PROGRAMS],
  languages: [...ALL_LANGUAGES],
  selectedId: null,
  status: "loading",
  error: "",
};

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
  const defaultSubjects = [
    "Data Structures",
    "Python Programming",
    "Database Management",
    "Object-Oriented Programming",
    "Mobile App Development",
    "Web Technologies",
  ];
  const programSubjects = [...new Set(state.programs.map((p) => p.subject))].filter(Boolean);
  const subjects = programSubjects.length > 0 ? programSubjects.sort((a, b) => a.localeCompare(b)) : defaultSubjects;

  const subjectSelect = $("subject");
  const languageSelect = $("language");
  const keepSubject = subjectSelect.value;
  const keepLanguage = languageSelect.value;

  subjectSelect.replaceChildren(
    el("option", { value: "", text: "All subjects" }),
    ...subjects.map((s) => el("option", { value: s, text: s })),
  );

  // ALWAYS populate with all supported languages!
  const languagesList = state.languages && state.languages.length > 0 ? state.languages : ALL_LANGUAGES;
  languageSelect.replaceChildren(
    el("option", { value: "", text: "All languages" }),
    ...languagesList.map((l) => el("option", { value: l.id, text: l.label })),
  );

  subjectSelect.value = subjects.includes(keepSubject) ? keepSubject : "";
  languageSelect.value = languagesList.some((l) => l.id === keepLanguage) ? keepLanguage : "";

  // Render quick filter tags if tag container exists
  renderQuickTags();
}

function renderQuickTags() {
  const container = $("quick-tags");
  if (!container) return;
  const activeLang = $("language").value;
  const popular = ["c", "python", "java", "sql", "dart", "html"];
  container.replaceChildren(
    el("span", { class: "quick-tag-label", text: "Filter:" }),
    el(
      "button",
      {
        type: "button",
        class: `quick-tag-btn ${!activeLang ? "active" : ""}`,
        text: "All",
        onclick: () => {
          $("language").value = "";
          renderQuickTags();
          renderList();
        },
      },
    ),
    ...popular.map((langId) => {
      const l = state.languages.find((x) => x.id === langId) || { id: langId, label: langId };
      return el("button", {
        type: "button",
        class: `quick-tag-btn ${activeLang === langId ? "active" : ""}`,
        text: l.label,
        onclick: () => {
          $("language").value = $("language").value === langId ? "" : langId;
          renderQuickTags();
          renderList();
        },
      });
    }),
  );
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

  if (state.status === "loading" && state.programs.length === 0) {
    pane.replaceChildren(...[1, 2, 3, 4].map(() => el("div", { class: "skeleton" })));
    $("result-count").textContent = "Loading programs";
    const statusText = $("result-status");
    if (statusText) statusText.textContent = "Loading programs...";
    return;
  }
  if (state.status === "error" && state.programs.length === 0) {
    pane.replaceChildren(
      el(
        "div",
        { class: "state error", role: "alert" },
        el("h2", { text: "Could not load programs" }),
        el("p", { text: state.error }),
        el("button", { type: "button", class: "btn btn-primary", text: "Try again", onclick: load }),
      ),
    );
    const statusText = $("result-status");
    if (statusText) statusText.textContent = "Unable to connect";
    return;
  }
  if (state.programs.length === 0) {
    pane.replaceChildren(stateBox("No programs yet", "An administrator can add the first program from the manage link at the top or bottom of the page."));
    $("result-count").textContent = "No programs";
    const statusText = $("result-status");
    if (statusText) statusText.textContent = "0 experiments";
    return;
  }
  const items = filtered();
  $("result-count").textContent = `${items.length} ${items.length === 1 ? "program" : "programs"} found`;
  const statusText = $("result-status");
  if (statusText) statusText.textContent = `${items.length} of ${state.programs.length} ${items.length === 1 ? "experiment" : "experiments"}`;

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
            renderQuickTags();
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
                      el("span", { class: `chip-dot chip-${p.language}` }),
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

  if (!state.selectedId) {
    pane.replaceChildren(
      stateBox(
        "Pick an experiment",
        "Choose an experiment from the list on the left to view, copy, or download its verified source code.",
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
        el("span", { text: `${langLabel(p.language)} • ${lines} ${lines === 1 ? "line" : "lines"}` }),
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
  try {
    const data = await api("/programs");
    if (data.programs && data.programs.length > 0) {
      state.programs = data.programs;
    } else {
      state.programs = CANONICAL_PROGRAMS;
    }
    if (data.languages && data.languages.length > 0) {
      state.languages = data.languages;
    }
    state.status = "ready";
  } catch (apiErr) {
    try {
      const res = await fetch("/data/programs.json");
      if (res.ok) {
        const data = await res.json();
        let programs = data.programs || [];
        try {
          const local = localStorage.getItem("lcl-custom-programs");
          if (local) programs = JSON.parse(local);
        } catch {}
        state.programs = programs.length > 0 ? programs : CANONICAL_PROGRAMS;
      } else {
        state.programs = CANONICAL_PROGRAMS;
      }
      state.status = "ready";
    } catch {
      state.programs = CANONICAL_PROGRAMS;
      state.status = "ready";
    }
  }
  fillFilters();
  render();
}

setupThemeToggle($("theme-toggle"));
for (const id of ["search", "subject", "language"]) {
  $(id).addEventListener("input", () => {
    if (id === "language") renderQuickTags();
    renderList();
  });
}

const clearBtn = $("search-clear");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    $("search").value = "";
    $("search").focus();
    renderList();
  });
}

// Global keyboard shortcut: / to focus search, Esc to clear
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

// Immediate first render with default state so nothing is empty
fillFilters();
readHash();
render();
load();
