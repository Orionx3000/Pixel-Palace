const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  console.log('Navigating to app...');
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle0' });
  
  // Switch to Studio
  console.log('Switching to Studio...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Anim'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  const studioHtml = await page.evaluate(() => {
    const wrapper = document.querySelector('div[style*="display: block"] > div.h-full');
    return wrapper ? wrapper.outerHTML : 'NOT FOUND';
  });
  console.log('Studio HTML length:', studioHtml.length);
  if (studioHtml.length < 500) {
      console.log('Studio HTML:', studioHtml);
  }
  
  // Test Editor
  console.log('Switching to Editor...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.textContent.includes('Editor'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        console.log('NO CANVAS FOUND');
        return;
    }
    const rect = canvas.getBoundingClientRect();
    console.log(`Canvas Rect: ${rect.width}x${rect.height} at ${rect.left},${rect.top}`);
    
    // Simulate mousedown
    const event = new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    canvas.dispatchEvent(event);
  });
  
  await new Promise(r => setTimeout(r, 500));
  await browser.close();
  console.log("Done");
})();
