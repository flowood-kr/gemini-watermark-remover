import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const SITE_URL = 'https://www.pixkit.kr';
const LEGACY_SITE_URL = 'https://pixkit.kr';

function readPublic(pathname) {
    return readFileSync(join(ROOT, 'public', pathname), 'utf8');
}

function extractJsonLd(html) {
    return [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
        .map((match) => JSON.parse(match[1]));
}

function extractTagContent(html, regex, label) {
    const match = html.match(regex);
    assert.ok(match, `missing ${label}`);
    return match[1];
}

test('public SEO files use the www canonical host', () => {
    const files = [
        'index.html',
        'terms.html',
        'privacy.html',
        'robots.txt',
        'sitemap.xml',
        'llms.txt',
    ];

    for (const file of files) {
        const content = readPublic(file);
        assert.ok(content.includes(SITE_URL), `${file} should reference ${SITE_URL}`);
        assert.equal(content.includes(LEGACY_SITE_URL), false, `${file} should not reference legacy apex URL`);
    }
});

test('homepage exposes indexable metadata and structured data', () => {
    const html = readPublic('index.html');
    const title = extractTagContent(html, /<title>([^<]+)<\/title>/, 'title');
    const description = extractTagContent(html, /<meta name="description" content="([^"]+)" \/>/, 'meta description');

    assert.equal(title, 'PixKit | 무료 이미지·PDF 도구');
    assert.equal(description, 'PixKit은 배경 제거, PDF 변환·편집, 워터마크 제거를 무료로 제공하며 파일을 서버에 저장하지 않습니다.');
    assert.ok(title.length <= 40, 'Naver title guideline should stay under 40 chars');
    assert.ok(description.length <= 80, 'Naver description guideline should stay under 80 chars');
    assert.match(html, /<meta name="robots" content="index, follow/);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.pixkit\.kr\/" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/www\.pixkit\.kr\/" \/>/);
    assert.match(html, /<link rel="sitemap" type="application\/xml" href="\/sitemap\.xml" \/>/);

    const blocks = extractJsonLd(html);
    assert.equal(blocks.length, 3);

    const graph = blocks[0]['@graph'];
    assert.ok(graph.some((item) => item['@type'] === 'Organization' && item['@id'] === `${SITE_URL}/#organization`));
    assert.ok(graph.some((item) => item['@type'] === 'WebSite' && item.url === `${SITE_URL}/`));
    assert.ok(graph.some((item) => item['@type'] === 'WebPage' && item.dateModified === '2026-05-20'));
    assert.ok(graph.some((item) => item['@type'] === 'WebApplication' && item.isAccessibleForFree === true));

    assert.equal(blocks[1]['@type'], 'FAQPage');
    assert.ok(blocks[1].mainEntity.length >= 6);
    assert.ok(blocks[2]['@graph'].every((item) => item['@type'] === 'HowTo'));
});

test('sitemap and robots point crawlers to canonical indexable URLs', () => {
    const sitemap = readPublic('sitemap.xml');
    const robots = readPublic('robots.txt');

    assert.match(robots, /Sitemap: https:\/\/www\.pixkit\.kr\/sitemap\.xml/);
    assert.match(robots, /User-agent: Yeti\nAllow: \//);
    assert.match(robots, /User-agent: GPTBot\nAllow: \//);

    assert.match(sitemap, /<loc>https:\/\/www\.pixkit\.kr\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/www\.pixkit\.kr\/terms\.html<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/www\.pixkit\.kr\/privacy\.html<\/loc>/);
    assert.match(sitemap, /<lastmod>2026-05-20<\/lastmod>/);
    assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
    assert.equal(sitemap.includes('schemas/sitemap-image/0.9'), false);
});

test('policy pages provide crawlable Korean trust content', () => {
    for (const file of ['terms.html', 'privacy.html']) {
        const html = readPublic(file);
        const blocks = extractJsonLd(html);

        assert.match(html, /<html lang="ko">/);
        assert.match(html, /<meta name="robots" content="index, follow/);
        assert.equal(blocks.length, 1);
        assert.equal(blocks[0].inLanguage, 'ko-KR');
        assert.equal(blocks[0].dateModified, '2026-05-20');
    }
});

test('llms.txt gives AI answer engines a concise PixKit summary', () => {
    const llms = readPublic('llms.txt');

    assert.match(llms, /^# PixKit/m);
    assert.match(llms, /preferred citation URL is https:\/\/www\.pixkit\.kr\//);
    assert.match(llms, /Gemini watermark removal/);
    assert.match(llms, /PDF to image conversion/);
    assert.match(llms, /not stored on PixKit servers/);
});
