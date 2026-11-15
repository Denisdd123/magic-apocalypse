// Генерация картинок через Gemini. Ключ берётся из переменной среды GEMINI_API_KEY.
// Использование: node scripts/gen-image.mjs <jobs.json> <outDir> [model]
// jobs.json: [{ "name": "bloodvial", "prompt": "..." }, ...]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [jobsFile, outDir, model = 'gemini-2.5-flash-image'] = process.argv.slice(2);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('Нет GEMINI_API_KEY'); process.exit(1); }
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

async function gen(job) {
  const out = join(outDir, job.name + '.png');
  if (existsSync(out) && !process.env.FORCE) { console.log('пропуск (уже есть):', job.name); return; }
  const body = {
    contents: [{ parts: [{ text: job.prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: job.aspect ?? '1:1' } },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) { console.error('ОШИБКА', job.name, j.error.code, j.error.status, j.error.message); return; }
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) { console.error('нет картинки в ответе:', job.name, JSON.stringify(j).slice(0, 300)); return; }
  writeFileSync(out, Buffer.from(part.inlineData.data, 'base64'));
  console.log('готово:', job.name);
}

const PAR = 3;
for (let i = 0; i < jobs.length; i += PAR) await Promise.all(jobs.slice(i, i + PAR).map(gen));
