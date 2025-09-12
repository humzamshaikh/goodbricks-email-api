# AWS Lambda Starter (Node.js 22)

Minimal starter for building AWS Lambda functions using Node.js 22.

## User guide

### Overview

This repository is a minimal, framework-agnostic starter for building multiple AWS Lambda functions in Node.js with TypeScript. Each lambda lives in its own folder under `src/lambdas/<lambda-name>` with:

- `index.ts` (the handler)
- `test/index.test.ts` (colocated tests)
- `requests/request.json` (a sample event for local runs)

A global API Gateway HTTP event template is kept at `requests/event.template.json` and is merged with each lambda's request JSON during local invocation.

### Local development

1. Install and build

- `npm install`
- `npm run build` (or simply use the scripts below which build first)

2. Quick invoke (pre-wired examples)
   (Recommended: use the TypeScript runner variants, marked with :ts)

- Get Hello World (TypeScript) (recommended): `npm run local:get-hello:ts`

Why TypeScript mode?

- Matches your development environment for fastest feedback
- No compile step between code and execution
- Full type-checking and path/alias behavior as configured in tsconfig

- Sample Lambda (TypeScript) (recommended): `npm run local:sample:ts`

3. Generic invoke (any lambda)

- TypeScript runner (recommended):
  - `npm run local:ts -- <src-handler-path> <per-lambda-request.json>`
  - Example:
    - `npm run local:ts -- src/lambdas/sample-lambda/index.ts src/lambdas/sample-lambda/requests/request.json`

4. Editing requests

- Edit `src/lambdas/<lambda>/requests/request.json` to change query/path/body for local calls
- Optionally add more JSON files under each lambda's `requests/` and pass that file to the runners above
- The global `requests/event.template.json` controls the base API Gateway v2 HTTP structure that is merged with your request override

5. Tests, lint, format

- Run tests: `npm test` (Jest will find tests in `src/**/test/*.test.ts` and `test/**`)

6. Per‑lambda tests

- Run only one lambda’s tests by path:

```bash
npm test -- src/lambdas/get-hello-world/test
# or a single file
npm test -- src/lambdas/get-hello-world/test/index.test.ts
```

- With coverage for that lambda:

```bash
npm run test:coverage -- src/lambdas/sample-lambda/test
```

- Coverage: `npm run test:coverage`
- Lint: `npm run lint`
- Format: `npm run format`

### Add a new lambda

1. Create the folder: `src/lambdas/my-new-lambda/`
2. Add files:

- `index.ts` (export `handler` as your Lambda entry)
- `test/index.test.ts` (co-located Jest tests)
- `requests/request.json` (sample event)

3. Invoke locally using the generic runners above, or add convenience scripts similar to the ones provided.

## Requirements

- Node.js >= 22 (see `.nvmrc`)

## Quick start

Install deps and run a local invoke (TypeScript mode):

```bash
npm install
npm start
```

This runs the example handler (`src/lambdas/get-hello-world/index.ts`) in TypeScript mode, merging the global template with the per‑lambda request JSON.

Invoke other handlers (replace path with your handler):

- TypeScript mode (two positionals: handler path and optional event path):

```bash
npm run local:ts -- src/lambdas/get-hello-world/index.ts src/lambdas/get-hello-world/requests/request.json
```

### Example: sample-lambda

````bash
npm run local:ts -- src/lambdas/sample-lambda/index.ts src/lambdas/sample-lambda/requests/request.json

### Convenience scripts
For quick local testing, you can use these scripts:

- Get Hello World (TypeScript):
```bash
npm run local:get-hello:ts
````

- Sample Lambda (TypeScript):

```bash
npm run local:sample:ts
```

## Project structure

- `src/lambdas/get-hello-world/index.ts` – Example handler used by default `npm start`
- `src/lambdas/*` – Additional handlers (folder per lambda with index.ts)
- `src/lib/*` – Shared utilities (e.g., `lib/response.ts`, `lib/http.ts`)
- `scripts/invoke-local.ts` – Local runner (TS mode)
- `dist/scripts/invoke-local.js` – Compiled runner (JS mode)
- `requests/event.template.json` – Generic API Gateway v2 HTTP event template
- `requests/*.json` – Request overrides to merge onto the template

## Packaging

This template is framework-agnostic. When you're ready to package/deploy, use your preferred tool (e.g., lambda-build, SAM, CDK, Terraform). No zip script is included by default.

## License

ISC
