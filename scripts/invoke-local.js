#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Usage:
// node scripts/invoke-local.js <handlerPath> <eventPath>
//   or with template/override:
// node scripts/invoke-local.js <handlerPath> --template <templatePath> --override <overridePath>
// Defaults: handlerPath=src/handler.js, eventPath=local/event.json

const argv = process.argv.slice(2);

function parseArgs(args) {
  const result = { handler: undefined, event: undefined, template: undefined, override: undefined };
  let i = 0;
  // First two positionals (if present and not flags) are handler and event
  const positionals = [];
  while (i < args.length) {
    const a = args[i];
    if (a === '--template' || a === '-t') {
      result.template = args[i + 1];
      i += 2;
      continue;
    }
    if (a === '--override' || a === '-o') {
      result.override = args[i + 1];
      i += 2;
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    }
    positionals.push(a);
    i += 1;
  }
  if (positionals[0]) result.handler = positionals[0];
  if (positionals[1]) result.event = positionals[1];
  return result;
}

const {
  handler: handlerPathArg,
  event: eventPathArg,
  template: templatePathArg,
  override: overridePathArg
} = parseArgs(argv);
const handlerModulePath = handlerPathArg || 'src/handler.js';
const eventFilePath = eventPathArg || 'local/event.json';
const templateFilePath = templatePathArg;
const overrideFilePath = overridePathArg;
const defaultTemplatePath = 'local/event.template.json';

function resolvePathWithExampleFallback(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(resolved)) return resolved;
  const exampleResolved = path.resolve(process.cwd(), 'example', filePath);
  if (fs.existsSync(exampleResolved)) return exampleResolved;
  const localResolved = path.resolve(process.cwd(), 'local', filePath);
  if (fs.existsSync(localResolved)) return localResolved;
  return resolved; // return original; caller will handle missing file error
}

function readEvent(filePath) {
  const resolved = resolvePathWithExampleFallback(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Event file not found: ${resolved}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON in event file:', err.message);
    process.exit(1);
  }
}

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    // Replace arrays by override entirely
    return override !== undefined ? override : base;
  }
  if (typeof base !== 'object' || base === null) return override !== undefined ? override : base;
  if (typeof override !== 'object' || override === null)
    return override !== undefined ? override : base;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key]);
  }
  return out;
}

async function loadHandler(modulePath) {
  const resolved = path.resolve(process.cwd(), modulePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Handler module not found: ${resolved}`);
    process.exit(1);
  }
  const mod = await import(pathToFileURL(resolved).href);
  const fn = mod && (mod.handler || mod.default);
  if (typeof fn !== 'function') {
    console.error(`Handler export not found in: ${resolved} (expected function export 'handler')`);
    process.exit(1);
  }
  return fn;
}

async function main() {
  const handler = await loadHandler(handlerModulePath);

  let event;
  if (templateFilePath || overrideFilePath) {
    let base = {};
    if (templateFilePath) {
      base = readEvent(templateFilePath);
    }
    if (overrideFilePath) {
      const ov = readEvent(overrideFilePath);
      event = deepMerge(base, ov);
    } else {
      event = base;
    }
  } else {
    // If user provided both handler and event as positionals without flags,
    // prefer merging default template with the provided event if template exists.
    const defaultTemplateExists = fs.existsSync(path.resolve(process.cwd(), defaultTemplatePath));
    if (eventPathArg && defaultTemplateExists) {
      const base = readEvent(defaultTemplatePath);
      const ov = readEvent(eventFilePath);
      event = deepMerge(base, ov);
    } else {
      event = readEvent(eventFilePath);
    }
  }

  try {
    const result = await handler(event, {});
    console.log('Lambda result:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Lambda errored:', err);
    process.exit(1);
  }
}

main();
