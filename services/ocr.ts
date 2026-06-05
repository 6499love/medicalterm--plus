import * as ort from "onnxruntime-web";
import { PaddleOcrService } from "paddleocr";

// Set WASM paths for ONNX runtime to avoid local resolution issues
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

let paddleOcrInstance: PaddleOcrService | null = null;
let initPromise: Promise<PaddleOcrService> | null = null;

export async function getPaddleOcr(): Promise<PaddleOcrService> {
  if (paddleOcrInstance) return paddleOcrInstance;
  
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const [detectOnnx, recOnnx, dictText] = await Promise.all([
      fetch('/models/PP-OCRv5_mobile_det_infer.onnx').then(r => {
        if (!r.ok) throw new Error("Failed to load det model");
        return r.arrayBuffer();
      }),
      fetch('/models/PP-OCRv5_mobile_rec_infer.onnx').then(r => {
        if (!r.ok) throw new Error("Failed to load rec model");
        return r.arrayBuffer();
      }),
      fetch('/models/ppocrv5_dict.txt').then(r => {
        if (!r.ok) throw new Error("Failed to load dict");
        return r.text();
      }),
    ]);

    const dict = dictText.split('\n').map(l => l.trim());

    const instance = await PaddleOcrService.createInstance({
      ort,
      detection: {
        modelBuffer: detectOnnx,
      },
      recognition: {
        modelBuffer: recOnnx,
        charactersDictionary: dict,
      },
    });

    paddleOcrInstance = instance;
    return instance;
  })();

  return initPromise;
}

export function fileToImageData(file: File): Promise<{ data: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Canvas context not available'));
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({
        data: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength),
        width: img.width,
        height: img.height
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
