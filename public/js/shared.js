// Helpers used by both the public page and the admin page.
// Nothing here ever builds HTML from strings: text goes in via textContent only.

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status}).`, data?.fields);
  return data;
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child !== undefined && child !== null) node.append(child);
  }
  return node;
}

export const slugify = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "program";

export function fileNameFor(program, languages) {
  const ext = languages.find((l) => l.id === program.language)?.ext || "txt";
  return `${slugify(program.subject)}-exp${program.experimentNumber}-${slugify(program.title)}.${ext}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall back below (older browsers, non-secure pages) */ }
  try {
    const area = el("textarea", { class: "sr-copy", readonly: true, "aria-hidden": "true" });
    area.value = text;
    document.body.append(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setupThemeToggle(button) {
  const paint = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    button.textContent = dark ? "Light theme" : "Dark theme";
    button.setAttribute("aria-pressed", String(dark));
  };
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("lcl-theme", next); } catch { /* ignore */ }
    paint();
  });
  paint();
}

// ---- Tiny syntax highlighter (no library). Returns [{ type, text }] tokens. ----
const WORDS = (s) => new Set(s.split(" "));
const C_LIKE = "if else for while do switch case break continue return new this class interface extends implements import package public private protected static final void const let var function try catch finally throw throws null true false in of async await abstract super default enum struct typedef sizeof include define namespace using template typename override late required";
const KEYWORDS = {
  c: WORDS(C_LIKE + " int char float double long short unsigned signed bool auto register extern volatile inline"),
  cpp: WORDS(C_LIKE + " int char float double long short unsigned signed bool auto string cout cin endl std virtual delete nullptr"),
  java: WORDS(C_LIKE + " int char float double long short boolean byte String System synchronized instanceof native transient"),
  dart: WORDS(C_LIKE + " int double num bool String List Map Set dynamic Future Widget State final covariant factory get set on is as with mixin extension typedef yield"),
  javascript: WORDS(C_LIKE + " typeof instanceof delete undefined NaN yield export from get set document window console"),
  python: WORDS("and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self print range len input int str float list dict set tuple"),
  sql: WORDS("select from where insert into values update set delete create table alter drop index view join inner left right outer full on group by order having limit offset distinct as and or not null is in like between exists union all primary key foreign references default check unique constraint int integer varchar char text date timestamp boolean count sum avg min max asc desc case when then else end begin commit rollback"),
  css: WORDS("important inherit initial auto none"),
  html: WORDS(""),
  text: WORDS(""),
};

const COMMENTS = {
  python: String.raw`#[^\n]*`,
  sql: String.raw`--[^\n]*|/\*[\s\S]*?\*/`,
  html: String.raw`<!--[\s\S]*?-->`,
  css: String.raw`/\*[\s\S]*?\*/`,
  text: "(?!)",
};
const DEFAULT_COMMENT = String.raw`//[^\n]*|/\*[\s\S]*?\*/`;
const STRINGS = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const PY_STRINGS = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|` + STRINGS;
const JS_STRINGS = STRINGS + String.raw`|` + "`(?:\\\\.|[^`\\\\])*`";

const regexCache = {};
function patternFor(lang) {
  if (regexCache[lang]) return regexCache[lang];
  const strings = lang === "python" ? PY_STRINGS : lang === "javascript" ? JS_STRINGS : STRINGS;
  const comment = COMMENTS[lang] ?? DEFAULT_COMMENT;
  const tag = lang === "html" ? String.raw`|(?<tag></?[A-Za-z][\w:-]*|/?>)` : "";
  const atRule = lang === "css" ? String.raw`|(?<tag>@[\w-]+)` : "";
  const pre = lang === "c" || lang === "cpp" ? String.raw`|(?<tag>^[ \t]*#[ \t]*\w+)` : "";
  regexCache[lang] = new RegExp(
    String.raw`(?<comment>${comment})|(?<string>${strings})${tag}${atRule}${pre}|(?<number>\b\d+(?:\.\d+)?\b)|(?<word>[A-Za-z_]\w*)`,
    "gm",
  );
  return regexCache[lang];
}

export function tokenize(code, lang) {
  if (lang === "text" || !KEYWORDS[lang]) return [{ type: "", text: code }];
  const pattern = patternFor(lang);
  pattern.lastIndex = 0;
  const keywords = KEYWORDS[lang];
  const tokens = [];
  let last = 0;
  let m;
  while ((m = pattern.exec(code)) !== null) {
    if (m[0] === "") { pattern.lastIndex++; continue; }
    let type = "";
    if (m.groups.comment) type = "comment";
    else if (m.groups.string) type = "string";
    else if (m.groups.tag) type = "keyword";
    else if (m.groups.number) type = "number";
    else if (m.groups.word) {
      const word = lang === "sql" ? m[0].toLowerCase() : m[0];
      type = keywords.has(word) ? "keyword" : "";
    }
    if (m.index > last) tokens.push({ type: "", text: code.slice(last, m.index) });
    tokens.push({ type, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ type: "", text: code.slice(last) });
  return tokens;
}

// Fills <code> with highlighted <span>s (text nodes only) and returns the line count.
export function renderCode(codeEl, gutterEl, code, lang) {
  const nodes = tokenize(code, lang).map((t) => (t.type ? el("span", { class: `tok-${t.type}`, text: t.text }) : document.createTextNode(t.text)));
  codeEl.replaceChildren(...nodes);
  const lines = code.replace(/\n$/, "").split("\n").length;
  gutterEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  return lines;
}
