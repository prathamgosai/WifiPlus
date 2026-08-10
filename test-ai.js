import { generateAiDiagnosis } from './core/ai-doctor.js';

const speed = { download: 300, upload: 50, ping: 12, jitter: 2, loss: 0 };
const bufferbloat = { grade: 'A', increase: 2 };
const diag = generateAiDiagnosis(speed, bufferbloat);
console.log(diag);

const speed2 = { download: 15, upload: 2, ping: 120, jitter: 50, loss: 5 };
const bufferbloat2 = { grade: 'F', increase: 450 };
const diag2 = generateAiDiagnosis(speed2, bufferbloat2);
console.log(diag2);
