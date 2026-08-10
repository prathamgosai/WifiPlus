const fs = require('fs');

let appJs = fs.readFileSync('d:\\WifiPlus-main new\\app.js', 'utf8');

// 1. Replace providers array
const providersRegex = /const providers = \[\s*\{ name: "Jio Fiber"[\s\S]*?\}\s*\];/;
const replacement = `let providers = [];\nimport { fetchIspData } from "./core/isp-data.js";`;
appJs = appJs.replace(providersRegex, replacement);

// 2. Replace property accesses
appJs = appJs.replace(/provider\.download(?![\.a-zA-Z])/g, 'provider.download.median');
appJs = appJs.replace(/provider\.upload(?![\.a-zA-Z])/g, 'provider.upload.median');
appJs = appJs.replace(/provider\.ping(?![\.a-zA-Z])/g, 'provider.ping.median');
appJs = appJs.replace(/provider\.jitter(?![\.a-zA-Z])/g, 'provider.jitter.median');

// 3. Make initialization async
const initBlockRegex = /initLocationControls\(\);\nrenderRegions\(\);\nrenderRankings\(\);\nrenderSeoPages\(\);\nupdateBandwidth\(\);\nupdatePingCalculator\(\);\nrecommendProviders\(\);/;
const asyncInitBlock = `async function initIspData() {
  providers = await fetchIspData();
  initLocationControls();
  renderRegions();
  renderRankings();
  renderSeoPages();
  updateBandwidth();
  updatePingCalculator();
  recommendProviders();
}
initIspData();`;
appJs = appJs.replace(initBlockRegex, asyncInitBlock);

fs.writeFileSync('d:\\WifiPlus-main new\\app.js', appJs);
console.log('Refactored app.js');
