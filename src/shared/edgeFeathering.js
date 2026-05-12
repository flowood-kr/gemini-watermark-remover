/**
 * 알파 채널 엣지 페더링 — 투명 경계의 계단현상(aliasing) 완화
 *
 * 동작:
 *  - 알파가 0(완전 투명) 픽셀에 인접한 불투명 픽셀을 찾아
 *    경계로부터 거리(distance transform) 기반으로 알파를 부드럽게 감쇠
 *  - 입력 ImageData 를 in-place 수정 (반환값도 동일 참조)
 *
 * 두 가지 모드:
 *  1. distance-mode (AI 마스크용): 알파값 자체를 거리 신호로 사용
 *  2. color-mode (단색 배경 BFS 결과용): 배경색과의 RGB 거리를 신호로 사용
 *
 * @param {ImageData} imageData
 * @param {object} [options]
 * @param {'distance'|'color'} [options.mode='distance']
 * @param {number} [options.radius=2]  거리 모드 전파 반경 (픽셀)
 * @param {number[]} [options.bgRgb]   color 모드: 배경색 [R,G,B]
 * @param {number} [options.softness=48] color 모드: 부드러움 거리 (RGB 유클리드 단위)
 * @returns {ImageData}
 */
export function featherAlphaEdges(imageData, options = {}) {
    const { mode = 'distance' } = options;
    if (mode === 'color') return featherByBgColor(imageData, options);
    return featherByDistance(imageData, options);
}

// ── distance 모드 ──────────────────────────────────────────────
// AI 마스크 결과(알파 0 또는 255 양극단)에 적용.
// 알파>0 인 픽셀 중 알파=0 픽셀에 인접하면 거리 기반 감쇠.
// radius>=2 면 2-ring 까지 확장하여 더 부드러운 전환 생성.
function featherByDistance(imageData, options) {
    const { radius = 2 } = options;
    const { data, width: w, height: h } = imageData;

    // 1-pass: 알파 0 픽셀에 인접한 불투명 픽셀 식별 → 임시 알파 마스크 저장
    const alphaCopy = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alphaCopy[i] = data[i * 4 + 3];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const pi = y * w + x;
            const a = alphaCopy[pi];
            if (a === 0) continue;

            // 4-방향 이웃 검사
            let minDist = Infinity;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                    if (alphaCopy[ny * w + nx] === 0) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < minDist) minDist = dist;
                    }
                }
            }

            if (minDist === Infinity) continue;
            // radius 거리까지 선형 감쇠. 가장 가까운 투명 이웃이 0거리에 붙어있으면 알파 0에 가깝게.
            const ratio = Math.min(1, minDist / radius);
            const newAlpha = Math.round(a * ratio);
            if (newAlpha < a) data[pi * 4 + 3] = newAlpha;
        }
    }

    return imageData;
}

// ── color 모드 ─────────────────────────────────────────────────
// 색상 BFS 모드 결과에 적용. 배경색과의 RGB 거리가 가까우면 알파 감쇠.
function featherByBgColor(imageData, options) {
    const { bgRgb, softness = 48 } = options;
    if (!bgRgb) return imageData;
    const [bgR, bgG, bgB] = bgRgb;
    const { data, width: w, height: h } = imageData;

    const colorDist = (i4) => {
        const dr = data[i4] - bgR;
        const dg = data[i4 + 1] - bgG;
        const db = data[i4 + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const pi = y * w + x;
            const i4 = pi * 4;
            if (data[i4 + 3] === 0) continue;

            const adj =
                (x > 0     && data[(pi - 1) * 4 + 3] === 0) ||
                (x < w - 1 && data[(pi + 1) * 4 + 3] === 0) ||
                (y > 0     && data[(pi - w) * 4 + 3] === 0) ||
                (y < h - 1 && data[(pi + w) * 4 + 3] === 0);

            if (adj) {
                const d = colorDist(i4);
                if (d < softness) data[i4 + 3] = Math.round((d / softness) * 255);
            }
        }
    }

    return imageData;
}

/**
 * Blob → 페더링 → Blob 헬퍼.
 * AI 모드 출력(투명 PNG)에 distance 페더링 적용 후 새 PNG Blob 반환.
 *
 * @param {Blob} blob
 * @param {object} [options] featherAlphaEdges 옵션 그대로 전달
 * @returns {Promise<Blob>}
 */
export async function featherBlobEdges(blob, options = {}) {
    const url = URL.createObjectURL(blob);
    try {
        const img = await loadImageElement(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        featherAlphaEdges(imageData, options);
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

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });
}
