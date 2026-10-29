// Server-side validation. The browser checks are only for convenience.
import { HttpError } from "./http.mjs";

// Single source of truth for languages. The frontend loads this list from the API.
export const LANGUAGES = {
  dart: { label: "Dart", ext: "dart" },
  java: { label: "Java", ext: "java" },
  python: { label: "Python", ext: "py" },
  javascript: { label: "JavaScript", ext: "js" },
  html: { label: "HTML", ext: "html" },
  css: { label: "CSS", ext: "css" },
  sql: { label: "SQL", ext: "sql" },
  c: { label: "C", ext: "c" },
  cpp: { label: "C++", ext: "cpp" },
  text: { label: "Plain text", ext: "txt" },
};

export const LIMITS = {
  maxCodeBytes: 500 * 1024, // 500 KB per program / uploaded file
  subjectMax: 60,
  titleMax: 120,
  descriptionMax: 300,
  maxExperimentNumber: 9999,
};

export const languageList = () => Object.entries(LANGUAGES).map(([id, v]) => ({ id, ...v }));

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function singleLine(value, label, min, max, errors, field) {
  if (typeof value !== "string") {
    errors[field] = `${label} is required.`;
    return "";
  }
  const clean = value.replace(/\s+/g, " ").trim();
  if (CONTROL_CHARS.test(clean)) errors[field] = `${label} contains invalid characters.`;
  else if (clean.length < min) errors[field] = `${label} must be at least ${min} characters.`;
  else if (clean.length > max) errors[field] = `${label} must be at most ${max} characters.`;
  return clean;
}

export function validateProgram(input) {
  const errors = {};
  let tooLarge = false;

  const subject = singleLine(input.subject, "Subject", 2, LIMITS.subjectMax, errors, "subject");
  const title = singleLine(input.title, "Title", 2, LIMITS.titleMax, errors, "title");

  let experimentNumber = input.experimentNumber;
  if (typeof experimentNumber === "string" && /^\d+$/.test(experimentNumber.trim())) {
    experimentNumber = Number(experimentNumber.trim());
  }
  if (!Number.isInteger(experimentNumber) || experimentNumber < 1 || experimentNumber > LIMITS.maxExperimentNumber) {
    errors.experimentNumber = `Experiment number must be a whole number from 1 to ${LIMITS.maxExperimentNumber}.`;
  }

  const language = input.language;
  if (typeof language !== "string" || !Object.hasOwn(LANGUAGES, language)) {
    errors.language = "Choose one of the supported languages.";
  }

  let description = "";
  if (input.description !== undefined && input.description !== null && input.description !== "") {
    if (typeof input.description !== "string") {
      errors.description = "Description must be text.";
    } else {
      description = input.description.replace(/\s+/g, " ").trim();
      if (CONTROL_CHARS.test(description)) errors.description = "Description contains invalid characters.";
      else if (description.length > LIMITS.descriptionMax) {
        errors.description = `Description must be at most ${LIMITS.descriptionMax} characters.`;
      }
    }
  }

  let code = "";
  if (typeof input.code !== "string" || input.code.trim() === "") {
    errors.code = "Source code is required.";
  } else if (input.code.includes("\u0000")) {
    errors.code = "This looks like a binary file. Only plain-text source code is allowed.";
  } else {
    code = input.code.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (Buffer.byteLength(code) > LIMITS.maxCodeBytes) {
      errors.code = `Source code is larger than ${LIMITS.maxCodeBytes / 1024} KB.`;
      tooLarge = true;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new HttpError(tooLarge ? 413 : 400, "Fix the highlighted fields.", { extra: { fields: errors } });
  }
  return { subject, experimentNumber, title, language, description, code };
}
