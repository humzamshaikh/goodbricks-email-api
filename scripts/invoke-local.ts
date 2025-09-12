#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

type AnyEvent = Record<string, unknown>;

function parseArgs(args: string[]) {
  const result: { handler?: string; event?: string; template?: string; override?: string } = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--template' || a === '-t') {
      result.template = args[++i];
      continue;
    }
    if (a === '--override' || a === '-o') {
      result.override = args[++i];
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    }
    positionals.push(a);
  }
  if (positionals[0]) result.handler = positionals[0];
  if (positionals[1]) result.event = positionals[1];
  return result;
}

const argv = process.argv.slice(2);
const {
  handler: handlerPathArg,
  event: eventPathArg,
  template: templatePathArg,
  override: overridePathArg
} = parseArgs(argv);
const handlerModulePath = handlerPathArg || 'src/handler.ts';
const eventFilePath = eventPathArg || 'requests/event.json';
const templateFilePath = templatePathArg;
const overrideFilePath = overridePathArg;
const defaultTemplatePath = 'requests/event.template.json';

function resolvePathWithFallback(filePath: string): string {
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), 'requests', filePath),
    path.resolve(process.cwd(), 'example', filePath)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function readEvent(filePath: string): AnyEvent {
  const resolved = resolvePathWithFallback(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Event file not found: ${resolved}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('Invalid JSON in event file:', err.message);
    process.exit(1);
  }
}

function deepMerge(base: any, override: any): any {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== 'object' || base === null) return override ?? base;
  if (typeof override !== 'object' || override === null) return override ?? base;
  const out: any = { ...base };
  for (const key of Object.keys(override)) out[key] = deepMerge(base[key], override[key]);
  return out;
}

async function loadHandler(modulePath: string): Promise<Function> {
  const resolved = path.resolve(process.cwd(), modulePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Handler module not found: ${resolved}`);
    process.exit(1);
  }
  const mod = await import(pathToFileURL(resolved).href);
  const fn: any = mod && (mod.handler || mod.default);
  if (typeof fn !== 'function') {
    console.error(`Handler export not found in: ${resolved} (expected function export 'handler')`);
    process.exit(1);
  }
  return fn as Function;
}

async function main() {
  const handler = await loadHandler(handlerModulePath);
  let event: AnyEvent;
  if (templateFilePath || overrideFilePath) {
    let base: AnyEvent = {};
    if (templateFilePath) base = readEvent(templateFilePath);
    if (overrideFilePath) event = deepMerge(base, readEvent(overrideFilePath));
    else event = base;
  } else {
    const defaultTemplateExists = fs.existsSync(path.resolve(process.cwd(), defaultTemplatePath));
    if (eventPathArg && defaultTemplateExists)
      event = deepMerge(readEvent(defaultTemplatePath), readEvent(eventFilePath));
    else event = readEvent(eventFilePath);
  }

  try {
    // @ts-ignore
    const result = await handler(event, {});
    console.log('Lambda result:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Lambda errored:', err);
    process.exit(1);
  }
}

main();
