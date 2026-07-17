const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  console.log('Navigating to app...');
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle0' });
  
  console.log('App loaded. Checking active tab...');
  // Check what is visible
  
  // Try switching to Studio
  console.log('Switching to Studio...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create Anim'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Dump HTML of Studio
  const studioHtml = await page.evaluate(() => {
    const s = document.querySelector('div[style*="display: block"] > .h-full');
    return s ? s.outerHTML : 'NOT FOUND';
  });
  console.log('Studio HTML length:', studioHtml.length);
  if (studioHtml.length < 500) {
      console.log('Studio HTML:', studioHtml);
  }
  
  // Switch to Editor
  console.log('Switching to Editor...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create Sprite'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Try drawing
  console.log('Drawing...');
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
  
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
