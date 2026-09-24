/** Step 5b: mount the bundle in Chromium, type, read the document back through the editor's own handle. */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(`${process.argv[2]}/package.json`)('@playwright/test');
const js = readFileSync(new URL('./dist/ui.js', import.meta.url));
const server = http.createServer((q, r) => q.url === '/ui.js'
  ? r.writeHead(200, { 'content-type': 'text/javascript' }).end(js)
  : r.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset=utf-8><div id=root></div><script type=module src=/ui.js></script>'));
await new Promise((ok) => server.listen(0, ok));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${server.address().port}/`);
const editor = page.getByTestId('editor-content');
await editor.click();
await page.keyboard.press('End');
await page.keyboard.type('線已經在。');
await page.keyboard.press('Enter');
await page.keyboard.type('## 第二段');                     // markdown shortcut -> heading
await page.keyboard.press('Enter');
await page.keyboard.type('**粗體**與一般字');               // markdown shortcut -> bold
const doc = await page.evaluate(() => window.readDoc());
const blocks = doc.root.children.map((n) => `${n.type}${n.tag ? ':' + n.tag : ''} ${JSON.stringify(n.children.map((c) => [c.text, c.format]))}`);
console.log('mounted in plain Chromium, typed, read back:');
for (const b of blocks) console.log('   ', b);
console.log('toolbar buttons rendered:', await page.locator('button').count(), '  page errors:', errors.length ? errors : 'none');
await browser.close(); server.close();
