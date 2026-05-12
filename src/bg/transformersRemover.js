/**
 * transformers.js v3 기반 고품질 배경 제거 — BiRefNet-lite
 *
 * 모델: onnx-community/BiRefNet_lite-ONNX  (MIT, 상용 가능)
 * - SOTA(2024) 근접 품질, 머리카락·털·복잡한 외곽선 등 강함
 * - 첫 로드 시 ~180MB 다운로드 (이후 브라우저 캐시)
 * - WebGPU 우선, 미지원 시 WASM 자동 폴백
 *
 * 출력:
 *  - 알파 채널이 적용된 PNG Blob (배경 투명)
 *
 * 모듈 로드는 호출부에서 동적 import (await import('./bg/transformersRemover.js'))
 * 로 수행 — 초기 번들 크기 영향 없음.
 */

const MODEL_ID = 'onnx-community/BiRefNet_lite-ONNX';
const CACHE_KEY = 'gwr_birefnet_lite_downloaded';

let pipelineCache = null;       // 모델 + 프로세서 캐시 (페이지 세션 동안 재사용)
let detectedDeviceCache = null; // 'webgpu' | 'wasm'

/**
 * BiRefNet-lite 로 배경 제거 실행.
 *
 * @param {Blob|File} blob
 * @param {object} [options]
 * @param {(stage: string, pct: number) => void} [options.onProgress]
 *   stage: 'load'(모델 로드) | 'infer'(추론) | 'compose'(합성)
 *   pct: 0~100
 * @returns {Promise<Blob>} PNG Blob (배경 투명)
 */
export async function removeWithBiRefNetLite(blob, options = {}) {
    const { onProgress } = options;

    // 1) 모델/프로세서 로드 (캐시)
    const { model, processor, device } = await loadPipeline((p) => {
        onProgress?.('load', p);
    });

    // 2) 원본 이미지 RawImage 로드
    const { RawImage } = await getTransformers();
    const objectUrl = URL.createObjectURL(blob);
    let rawImage;
    try {
        rawImage = await RawImage.fromURL(objectUrl);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }

    // 3) 전처리 + 추론
    onProgress?.('infer', 10);
    const { pixel_values } = await processor(rawImage);
    const output = await model({ input_image: pixel_values });

    // 4) 모델 출력 — output_image (또는 output[0]) 키 호환 처리
    const outputTensor = output.output_image
        || output.logits
        || output.last_hidden_state
        || Object.values(output)[0];
    if (!outputTensor) {
        throw new Error('BiRefNet 출력 텐서를 찾을 수 없습니다.');
    }

    onProgress?.('infer', 80);

    // 5) sigmoid → uint8 마스크 → 원본 사이즈로 리사이즈
    const maskTensor = outputTensor[0].sigmoid().mul_(255).to('uint8');
    const maskRaw = await RawImage.fromTensor(maskTensor).resize(
        rawImage.width,
        rawImage.height,
    );

    // 6) 원본 + 마스크 합성 → PNG Blob
    onProgress?.('compose', 95);
    const finalBlob = await compositeWithMask(blob, maskRaw);
    onProgress?.('compose', 100);

    // 7) 첫 성공 시 캐시 플래그 기록 (다음부터 동의 모달 생략)
    try {
        localStorage.setItem(CACHE_KEY, String(Date.now()));
    } catch {
        /* private mode 등에서 실패해도 무시 */
    }

    return finalBlob;
}

/** 모델이 한 번이라도 다운로드된 적 있는지 (UI에서 동의 모달 생략 판단용) */
export function isModelCached() {
    try {
        return !!localStorage.getItem(CACHE_KEY);
    } catch {
        return false;
    }
}

/** 마지막으로 감지된 실행 디바이스 ('webgpu' | 'wasm' | null) */
export function getLastDevice() {
    return detectedDeviceCache;
}

// ──────────────────────────────────────────────
// 내부 헬퍼
// ──────────────────────────────────────────────

async function loadPipeline(onLoadProgress) {
    if (pipelineCache) return pipelineCache;

    const tf = await getTransformers();
    const { AutoModel, AutoProcessor } = tf;

    // WebGPU 우선 — 사용 가능 여부 판단
    const device = await pickDevice();
    detectedDeviceCache = device;

    // progress_callback 으로 다운로드 진척 전달
    const progressHandler = (info) => {
        // transformers.js 의 progress 이벤트 형태:
        //   { status: 'progress', file, loaded, total, progress }
        if (info?.status === 'progress' && typeof info.progress === 'number') {
            onLoadProgress?.(Math.min(99, Math.round(info.progress)));
        } else if (info?.status === 'done') {
            onLoadProgress?.(99);
        }
    };

    const modelOpts = {
        progress_callback: progressHandler,
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'fp32',
    };

    const model = await AutoModel.from_pretrained(MODEL_ID, modelOpts);
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: progressHandler,
    });

    onLoadProgress?.(100);
    pipelineCache = { model, processor, device };
    return pipelineCache;
}

let transformersPromise = null;
function getTransformers() {
    if (!transformersPromise) {
        transformersPromise = import('@huggingface/transformers');
    }
    return transformersPromise;
}

async function pickDevice() {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) return 'webgpu';
        } catch {
            /* fall through */
        }
    }
    return 'wasm';
}

/**
 * 원본 Blob 과 모델이 추정한 mask(RawImage, grayscale)를 합성하여
 * 배경 투명 PNG Blob 생성.
 */
async function compositeWithMask(originalBlob, maskRaw) {
    const url = URL.createObjectURL(originalBlob);
    try {
        const img = await loadImage(url);
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // maskRaw 는 grayscale RawImage (.data, .channels)
        const maskData = maskRaw.data;
        const channels = maskRaw.channels || 1;

        // 마스크가 1ch grayscale 이면 직접 매핑.
        // 다채널이면 첫 채널만 사용.
        for (let i = 0; i < w * h; i++) {
            const m = maskData[i * channels];
            // 마스크 값 = 전경 확률(0~255). 그대로 알파로 채택.
            data[i * 4 + 3] = m;
        }

        ctx.putImageData(imageData, 0, 0);
        return await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
                'image/png',
            );
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });
}
