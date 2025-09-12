import fs from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE = `import { createHttpHandler, ApiGatewayEventLike } from "../../lib/handler.js";

const handlerLogic = (_event: ApiGatewayEventLike) => {
  return { message: "Test lambda" };
};

export const handler = createHttpHandler(handlerLogic);
`;

async function main() {
  const repoRoot = process.cwd();
  const target = path.resolve(repoRoot, 'src/lambdas/test-lambda/index.ts');

  try {
    await fs.access(target);
  } catch {
    console.error(`File not found: ${path.relative(repoRoot, target)}`);
    console.error('Please create src/lambdas/test-lambda/index.ts first.');
    process.exit(1);
  }

  await fs.writeFile(target, TEMPLATE, 'utf8');
  console.log(`Updated ${path.relative(repoRoot, target)} to match handler structure.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
