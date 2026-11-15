// Генерация картинок через локальный ComfyUI (FLUX.1-schnell fp8).
// node scripts/comfy-gen.mjs jobs.json outDir
// jobs.json: [{ "name": "mage_1", "prompt": "...", "w": 1024, "h": 1024, "seed": 1, "steps": 4 }]
import fs from 'node:fs';
import path from 'node:path';

const HOST = process.env.COMFY || 'http://127.0.0.1:8188';
const [, , jobsFile, outDir = 'art-raw'] = process.argv;
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

function workflow(j) {
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell-fp8.safetensors' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: j.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: j.w || 1024, height: j.h || 1024, batch_size: 1 } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: j.seed ?? Math.floor(Math.random() * 1e9), steps: j.steps || 4, cfg: 1,
        sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'ma_' + j.name } },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const j of jobs) {
  const t0 = Date.now();
  const res = await fetch(HOST + '/prompt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow(j) }),
  });
  const { prompt_id, error, node_errors } = await res.json();
  if (!prompt_id) { console.error(j.name, error, node_errors); continue; }
  let out;
  for (;;) {
    await sleep(1000);
    const h = await (await fetch(HOST + '/history/' + prompt_id)).json();
    if (h[prompt_id]?.outputs?.['9']) { out = h[prompt_id].outputs['9'].images[0]; break; }
    if (h[prompt_id]?.status?.status_str === 'error') { console.error(j.name, 'error', JSON.stringify(h[prompt_id].status)); break; }
  }
  if (!out) continue;
  const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder, type: out.type });
  const buf = Buffer.from(await (await fetch(HOST + '/view?' + q)).arrayBuffer());
  fs.writeFileSync(path.join(outDir, j.name + '.png'), buf);
  console.log(j.name, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
