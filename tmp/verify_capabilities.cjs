const { chromium } = require('C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({width, height});
      await page.goto('http://127.0.0.1:4173/foreLas/', {waitUntil: 'networkidle'});
      assert.equal(await page.locator('a[href*="zenodo.19546162"], a[href*="github.com/fora-platform/fora"]').count(), 0);
      await page.locator('#capabilities').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.cap-thumbnail')].every(img => img.complete && img.naturalWidth > 0));
      assert.equal(await page.locator('.cap-thumbnail').count(), 4);
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
        images: [...document.querySelectorAll('.cap-thumbnail')].map(img => ({src: img.getAttribute('src'), alt: img.alt, width: img.clientWidth, height: img.clientHeight})),
      }));
      assert.ok(layout.content <= layout.viewport, JSON.stringify(layout));
      await page.locator('#capabilities').screenshot({path: `tmp/capabilities-${name}.png`});
      await page.screenshot({path: `tmp/homepage-${name}.png`, fullPage: true});
      await page.locator('.landing-footer button').click();
      assert.equal(await page.locator('.citation-panel').count(), 1);
      console.log(name, JSON.stringify(layout));
    }
    assert.deepEqual(errors, []);
    console.log('Links, all four local images, responsive widths, citation toggle and runtime errors checked.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
