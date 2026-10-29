// Tests for browser helpers that don't need a DOM (tokenizer, file names).
import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, slugify, fileNameFor } from "../public/js/shared.js";

const join = (tokens) => tokens.map((t) => t.text).join("");

test("tokenizer never loses or alters characters, for every language", () => {
  const samples = {
    c: '#include <stdio.h>\nint main(){ printf("hi\\n"); /* c */ return 0; } // end',
    cpp: 'int x = 42; std::cout << "a" << endl;',
    java: 'public class A { String s = "x"; // c\n}',
    dart: "final x = 'a'; // c",
    javascript: "const t = `a ${b}`; let n = 3.5; // c",
    python: 'def f():\n    """doc\nstring"""\n    return "x" # c',
    sql: "SELECT * FROM t -- c\nWHERE a = 'b';",
    css: "a { color: red; } /* c */ @media x {}",
    html: '<!-- c --><div class="a">x</div>',
    text: "just <b>text</b>",
  };
  for (const [lang, code] of Object.entries(samples)) assert.equal(join(tokenize(code, lang)), code, lang);
});

test("tokenizer labels keywords, strings, comments and numbers", () => {
  const types = (code, lang) => Object.fromEntries(tokenize(code, lang).filter((t) => t.type).map((t) => [t.text, t.type]));
  assert.deepEqual(types('return "x" // c 12', "javascript"), { return: "keyword", '"x"': "string", "// c 12": "comment" });
  assert.equal(types("SELECT 7", "sql").SELECT, "keyword");
  assert.equal(types("SELECT 7", "sql")["7"], "number");
  assert.equal(types("# note", "python")["# note"], "comment");
});

test("markup in code stays plain text tokens (the renderer only uses textContent)", () => {
  const tokens = tokenize("<script>alert(1)</script>", "html");
  assert.equal(join(tokens), "<script>alert(1)</script>");
});

test("file names use the language extension", () => {
  const langs = [{ id: "python", ext: "py" }, { id: "cpp", ext: "cpp" }];
  assert.equal(slugify("  Hello, World!! "), "hello-world");
  assert.equal(fileNameFor({ subject: "Data Structures", experimentNumber: 3, title: "Stack (array)", language: "python" }, langs), "data-structures-exp3-stack-array.py");
  assert.equal(fileNameFor({ subject: "X", experimentNumber: 1, title: "T", language: "unknown" }, langs), "x-exp1-t.txt");
});
