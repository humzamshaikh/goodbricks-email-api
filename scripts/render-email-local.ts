import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderComponentToHtml, renderJsxStringToHtml } from '../src/lambdas/post-renderemailapi/index.ts';
import WelcomeEmail from '../src/lambdas/post-renderemaillayoutapi/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log('Testing imported component...');
    // A) Render imported component
    const a = await renderComponentToHtml(WelcomeEmail as any, { firstName: 'Omar', company: 'GoodBricks' }, { pretty: true, includeText: true });
    console.log('Imported component HTML length:', a.html.length);
    if (a.text) console.log('Imported component TEXT length:', a.text.length);
    console.log('Sample HTML:', a.html.substring(0, 200) + '...');

    console.log('\nTesting JSX string compilation...');
    // B) Render from JSX file content
    const jsxPath = path.resolve(__dirname, '../src/emails/WelcomeEmail.tsx');
    const jsxSource = fs.readFileSync(jsxPath, 'utf8');
    const b = await renderJsxStringToHtml(jsxSource, { props: { firstName: 'Omar', company: 'GoodBricks' }, renderOptions: { pretty: true, includeText: true } });
    console.log('JSX string HTML length:', b.html.length);
    if (b.text) console.log('JSX string TEXT length:', b.text.length);
    console.log('Sample HTML:', b.html.substring(0, 200) + '...');
    
    console.log('\n✅ Both tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


