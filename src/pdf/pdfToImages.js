// ──────────────────────────────────────────────
// PDF → 이미지 변환 모듈
// pdfjs-dist 기반 (동적 import로 lazy load)
// ──────────────────────────────────────────────

let pdfjsPromise = null;

async function getPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = (async () => {
            const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
            // 워커는 jsDelivr CDN에서 로드 (버전 자동 매칭)
            pdfjs.GlobalWorkerOptions.workerSrc =
                `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
            return pdfjs;
        })().catch((err) => {
            pdfjsPromise = null;
            throw err;
        });
    }
    return pdfjsPromise;
}

// 파일을 pdfjs 문서로 로드
export async function loadPdfDocument(fileOrArrayBuffer) {
    const pdfjs = await getPdfJs();
    const data = fileOrArrayBuffer instanceof ArrayBuffer
        ? fileOrArrayBuffer
        : await fileOrArrayBuffer.arrayBuffer();
    // 원본 ArrayBuffer 보존을 위해 복사본 전달 (pdfjs가 내부에서 transfer할 수 있음)
    const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
    return await loadingTask.promise;
}

// 단일 페이지를 canvas에 렌더링 후 Blob으로 반환
// scale: 1 = 72 DPI, 약 4.17 = 300 DPI
export async function renderPageToBlob(pdfDoc, pageNumber, {
    scale = 2,
    format = 'png',   // 'png' | 'jpeg'
    quality = 0.92,
} = {}) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: format === 'png' });

    // JPG는 불투명 배경 필요 (PDF는 투명 배경일 수 있음)
    if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    page.cleanup();

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('이미지 변환 실패'));
            resolve(blob);
        }, mime, format === 'jpeg' ? quality : undefined);
    });
}

// 여러 페이지를 일괄 변환 (진행률 콜백 지원)
export async function convertPdfToImages(fileOrArrayBuffer, {
    dpi = 300,
    format = 'png',
    quality = 0.92,
    onProgress = null,
} = {}) {
    const pdfDoc = await loadPdfDocument(fileOrArrayBuffer);
    const total = pdfDoc.numPages;
    const scale = dpi / 72;
    const results = [];

    try {
        for (let i = 1; i <= total; i++) {
            const blob = await renderPageToBlob(pdfDoc, i, { scale, format, quality });
            results.push({ pageNumber: i, blob });
            if (onProgress) onProgress(i, total);
        }
    } finally {
        pdfDoc.cleanup();
        pdfDoc.destroy();
    }

    return results;
}

// 저해상도 썸네일 렌더 (편집 모드 페이지 카드용)
export async function renderThumbnail(pdfDoc, pageNumber, { maxWidth = 200 } = {}) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport1x = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / viewport1x.width, 2);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    page.cleanup();

    return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('썸네일 생성 실패'));
            resolve(blob);
        }, 'image/jpeg', 0.8);
    });
}
