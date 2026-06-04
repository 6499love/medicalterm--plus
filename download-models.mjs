import fs from 'fs';
import path from 'path';

const files = [
  'PP-OCRv5_mobile_det_infer.onnx',
  'PP-OCRv5_mobile_rec_infer.onnx',
  'ppocrv5_dict.txt'
];

const baseUrl = 'https://cdn.jsdelivr.net/gh/X3ZvaWQ/paddleocr.js@main/assets/';
const destDir = path.resolve('public/models');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

async function downloadFile(filename) {
  console.log('Downloading ' + filename + '...');
  const res = await fetch(baseUrl + filename);
  if (!res.ok) throw new Error('Failed to download ' + filename);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(destDir, filename), buffer);
  console.log('Saved ' + filename);
}

async function main() {
  try {
    for (const file of files) {
      await downloadFile(file);
    }
    console.log('All models downloaded successfully!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
