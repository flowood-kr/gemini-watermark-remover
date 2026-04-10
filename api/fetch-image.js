/**
 * Vercel Serverless Function: 이미지 프록시
 *
 * 역할:
 *  1. 직접 이미지 URL → 이미지 바이트를 그대로 프록시 반환
 *  2. HTML 페이지 URL (ex: Gemini 공유 링크) → og:image 추출 후 이미지 바이트 반환
 *
 * 왜 필요한가:
 *  브라우저에서는 CORS 정책으로 외부 이미지/페이지를 직접 읽을 수 없음.
 *  서버에서 대신 fetch 하면 CORS 제약이 없어 처리 가능.
 */

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

const FETCH_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,image/*,*/*;q=0.9',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

export default async function handler(req, res) {
    // CORS — 같은 오리진에서만 호출하지만 혹시 몰라 명시
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url 파라미터가 필요합니다.' });

    // URL 유효성 검사
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return res.status(400).json({ error: 'http/https URL만 지원합니다.' });
        }
    } catch {
        return res.status(400).json({ error: '올바른 URL 형식이 아닙니다.' });
    }

    try {
        // 1차 fetch: 원본 URL
        const upstream = await fetch(url, {
            headers: FETCH_HEADERS,
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
        });

        if (!upstream.ok) {
            return res.status(upstream.status).json({
                error: `원격 서버 오류: ${upstream.status} ${upstream.statusText}`,
            });
        }

        const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim();

        // ── 이미지인 경우: 바로 프록시 ──────────────────────────────
        if (contentType.startsWith('image/')) {
            return await streamImage(upstream, contentType, res);
        }

        // ── HTML인 경우: og:image 추출 → 이미지 재요청 ──────────────
        if (contentType.includes('text/html')) {
            const html = await upstream.text();
            const imageUrl = extractImageUrlFromHtml(html, url);

            if (!imageUrl) {
                return res.status(422).json({
                    error: '페이지에서 이미지를 찾을 수 없습니다. 직접 이미지 URL을 사용해 주세요.',
                });
            }

            // 추출된 이미지 URL 재요청
            const imgRes = await fetch(imageUrl, {
                headers: FETCH_HEADERS,
                redirect: 'follow',
                signal: AbortSignal.timeout(15000),
            });

            if (!imgRes.ok) {
                return res.status(imgRes.status).json({
                    error: `이미지 서버 오류: ${imgRes.status}`,
                });
            }

            const imgType = (imgRes.headers.get('content-type') || 'image/jpeg')
                .split(';')[0]
                .trim();
            return await streamImage(imgRes, imgType, res);
        }

        return res.status(422).json({ error: '이미지 또는 HTML 응답이 아닙니다.' });
    } catch (err) {
        console.error('[fetch-image proxy error]', err);
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return res.status(504).json({ error: '요청 시간이 초과됐습니다.' });
        }
        return res.status(500).json({ error: '이미지를 가져오지 못했습니다.' });
    }
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function streamImage(fetchRes, contentType, res) {
    const buffer = await fetchRes.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: '이미지 크기가 너무 큽니다. (최대 25 MB)' });
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', buffer.byteLength);
    return res.send(Buffer.from(buffer));
}

/**
 * HTML에서 이미지 URL 추출 우선순위:
 *  1. og:image
 *  2. twitter:image
 *  3. <link rel="image_src">
 *  4. 첫 번째 <img src>
 */
function extractImageUrlFromHtml(html, baseUrl) {
    const patterns = [
        // og:image (속성 순서 무관)
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        // twitter:image
        /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
        // link rel="image_src"
        /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];

    for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) return resolveUrl(m[1], baseUrl);
    }

    // 마지막 수단: 첫 번째 <img src>
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) return resolveUrl(imgMatch[1], baseUrl);

    return null;
}

function resolveUrl(url, base) {
    try {
        return new URL(url, base).href;
    } catch {
        return url;
    }
}
