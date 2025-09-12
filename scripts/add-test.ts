import fs from 'node:fs/promises';
import path from 'node:path';

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function usageAndExit(): never {
  console.error('Usage: npm run add:test -- <lambda-name | path/to/lambda>');
  console.error('Example: npm run add:test -- get-hello-world');
  process.exit(1);
}

async function main() {
  const [, , ...args] = process.argv;
  const input = args[0];
  if (!input) usageAndExit();

  // Accept either just the name or a path; normalize to the folder name
  const lambdaName = path.basename(input);
  const repoRoot = process.cwd();
  const lambdaDir = path.resolve(repoRoot, 'src', 'lambdas', lambdaName);
  const indexTs = path.join(lambdaDir, 'index.ts');

  if (!(await fileExists(lambdaDir)) || !(await fileExists(indexTs))) {
    console.error(
      `Expected existing lambda folder and handler: ${path.relative(repoRoot, indexTs)}`
    );
    console.error('Please create the folder and index.ts first.');
    process.exit(1);
  }

  // Ensure requests/request.json
  const requestsDir = path.join(lambdaDir, 'requests');
  const requestJsonPath = path.join(requestsDir, 'request.json');
  if (!(await fileExists(requestsDir))) {
    await fs.mkdir(requestsDir, { recursive: true });
  }
  if (!(await fileExists(requestJsonPath))) {
    const defaultEvent = {
      requestContext: { http: { method: 'GET', path: `/${lambdaName}` } }
    } as unknown as Record<string, unknown>;
    await fs.writeFile(requestJsonPath, JSON.stringify(defaultEvent, null, 2) + '\n', 'utf8');
    console.log(`Created ${path.relative(repoRoot, requestJsonPath)}`);
  } else {
    console.log(`Exists  ${path.relative(repoRoot, requestJsonPath)} (skipping)`);
  }

  // Ensure test/index.test.ts
  const testDir = path.join(lambdaDir, 'test');
  const testPath = path.join(testDir, 'index.test.ts');
  if (!(await fileExists(testDir))) {
    await fs.mkdir(testDir, { recursive: true });
  }
  if (!(await fileExists(testPath))) {
    const testSource = `import { handler } from '../index.js';\nimport event from '../requests/request.json' with { type: 'json' };\n\ntest('handler returns 200', async () => {\n  const res = await handler(event as any, {} as any);\n  expect(res.statusCode).toBe(200);\n});\n`;
    await fs.writeFile(testPath, testSource, 'utf8');
    console.log(`Created ${path.relative(repoRoot, testPath)}`);
  } else {
    console.log(`Exists  ${path.relative(repoRoot, testPath)} (skipping)`);
  }

  console.log('\nDone. You can run:');
  console.log(`  npm run local:invoke -- dist/src/lambdas/${lambdaName}/index.js \\`);
  console.log('    --template requests/event.template.json \\');
  console.log(`    --override src/lambdas/${lambdaName}/requests/request.json`);
  console.log(
    `  npm run local:ts -- src/lambdas/${lambdaName}/index.ts src/lambdas/${lambdaName}/requests/request.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
