const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle2', timeout: 30000 });
  
  const errorText = await page.evaluate(() => {
    return document.getElementById('error-box')?.innerText || 'No error box found';
  });
  
  console.log('ERROR TEXT:', errorText);

  await browser.close();
})();
