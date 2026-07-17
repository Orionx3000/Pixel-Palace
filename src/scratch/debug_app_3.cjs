const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  console.log('Navigating to app...');
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle0' });
  
  // Test Editor
  console.log('Switching to Editor...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.textContent.includes('Editor'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  
  // Test Studio
  console.log('Switching to Studio...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.textContent.includes('Studio'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  
  const contentHtml = await page.evaluate(() => {
    const content = document.querySelector('.content');
    return content ? content.outerHTML : 'NOT FOUND';
  });
  
  fs.writeFileSync('D:\\PixelPalaceTauri\\src\\scratch\\content_dump.html', contentHtml);
  console.log('Dumped content to content_dump.html');
  
  // Switch back to editor to check canvas
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.tab')).find(b => b.textContent.includes('Editor'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        console.log('NO CANVAS FOUND');
        return;
    }
    const rect = canvas.getBoundingClientRect();
    console.log(`Canvas Rect: ${rect.width}x${rect.height} at ${rect.left},${rect.top}`);
  });
  
  await browser.close();
  console.log("Done");
})();
