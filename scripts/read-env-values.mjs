#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [, , envFile, ...requestedNames] = process.argv;

if (!envFile || requestedNames.length === 0) {
  process.exit(0);
}

const requested = new Set(requestedNames);
const source = readFileSync(envFile, "utf8");
const values = new Map();
const lines = source.split(/\r?\n/);

for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
  );
  if (!match || !requested.has(match[1])) {
    continue;
  }

  const name = match[1];
  let rawValue = match[2];
  const quote = rawValue[0];

  if (quote === '"' || quote === "'") {
    while (!hasClosingQuote(rawValue, quote) && index + 1 < lines.length) {
      index += 1;
      rawValue += `\n${lines[index]}`;
    }

    if (hasClosingQuote(rawValue, quote)) {
      rawValue = rawValue.slice(1, -1);
    } else {
      rawValue = rawValue.slice(1);
    }

    if (quote === '"') {
      rawValue = rawValue
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  } else {
    rawValue = rawValue.replace(/\s+#.*$/, "").trim();
  }

  values.set(name, rawValue);
}

for (const name of requestedNames) {
  if (!values.has(name)) {
    continue;
  }

  process.stdout.write(`${name}\0${values.get(name)}\0`);
}

function hasClosingQuote(value, quote) {
  if (value.length < 2 || value.at(-1) !== quote) {
    return false;
  }

  if (quote === "'") {
    return true;
  }

  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}
