import {
    WatermarkEngine,
    detectWatermarkConfig,
    calculateWatermarkPosition
} from './core/watermarkEngine.js';
import { WatermarkWorkerClient, canUseWatermarkWorker } from './core/workerClient.js';
import {
    isConfirmedWatermarkDecision,
    resolveDisplayWatermarkInfo
} from './core/watermarkDisplay.js';
import { canvasToBlob } from './core/canvasBlob.js';
import {
    loadImage,
    setStatusMessage,
    showLoading,
    hideLoading
} from './utils.js';
import JSZip from 'jszip';
import mediumZoom from 'medium-zoom';

// ──────────────────────────────────────────────
// 전역 상태
// ──────────────────────────────────────────────
let enginePromise = null;
let workerClient = null;
let imageQueue = [];
let processedCount = 0;
let zoom = null;
let currentSingleItem = null;
let currentMode = 'watermark'; // 'watermark' | 'background'

// DOM 참조
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const singlePreview = document.getElementById('singlePreview');
const multiPreview = document.getElementById('multiPreview');
const imageList = document.getElementById('imageList');
const progressText = document.getElementById('progressText');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const originalImage = document.getElementById('originalImage');
const processedImage = document.getElementById('processedImage');
const originalInfo = document.getElementById('originalInfo');
const processedInfo = document.getElementById('processedInfo');
const downloadSection = document.getElementById('downloadSection');

// ──────────────────────────────────────────────
// 엔진 초기화
// ──────────────────────────────────────────────
async function getEngine() {
    if (!enginePromise) {
        enginePromise = WatermarkEngine.create().catch((error) => {
            enginePromise = null;
            throw error;
        });
    }
    return enginePromise;
}

function getEstimatedWatermarkInfo(item) {
    if (!item?.originalImg) return null;
    const { width, height } = item.originalImg;
    const config = detectWatermarkConfig(width, height);
    const position = calculateWatermarkPosition(width, height, config);
    return { size: config.logoSize, position, config };
}

function disableWorkerClient(reason) {
    if (!workerClient) return;
    console.warn('워커 비활성화, 메인 스레드로 폴백:', reason);
    workerClient.dispose();
    workerClient = null;
}

// ──────────────────────────────────────────────
// 앱 초기화
// ──────────────────────────────────────────────
async function init() {
    try {
        setupDarkMode();
        showLoading('리소스 로딩 중...');

        if (canUseWatermarkWorker()) {
            try {
                workerClient = new WatermarkWorkerClient({
                    workerUrl: './workers/watermark-worker.js'
                });
            } catch (workerError) {
                console.warn('워커 초기화 실패, 메인 스레드로 폴백:', workerError);
                workerClient = null;
            }
        }
        if (!workerClient) {
            getEngine().catch((error) => {
                console.warn('메인 스레드 엔진 웜업 실패:', error);
            });
        }

        hideLoading();
        setupEventListeners();
        setupSlider();

        zoom = mediumZoom('[data-zoomable]', {
            margin: 24,
            scrollOffset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
        });

        document.body.classList.remove('loading');
    } catch (error) {
        hideLoading();
        document.body.classList.remove('loading');
        console.error('초기화 오류:', error);
    }
}

// ──────────────────────────────────────────────
// 모드 토글 (워터마크 제거 / 배경 제거)
// ──────────────────────────────────────────────
function setupModeToggle() {
    const btnWatermark = document.getElementById('modeWatermark');
    const btnBgRemoval = document.getElementById('modeBgRemoval');
    const bgHint = document.getElementById('bgModeHint');

    const activeClasses = ['bg-white', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-100', 'shadow-sm'];
    const inactiveClasses = ['text-gray-500', 'dark:text-gray-400'];

    function applyMode(mode) {
        currentMode = mode;

        if (mode === 'watermark') {
            btnWatermark.classList.add(...activeClasses);
            btnWatermark.classList.remove(...inactiveClasses);
            btnBgRemoval.classList.remove(...activeClasses);
            btnBgRemoval.classList.add(...inactiveClasses);
        } else {
            btnBgRemoval.classList.add(...activeClasses);
            btnBgRemoval.classList.remove(...inactiveClasses);
            btnWatermark.classList.remove(...activeClasses);
            btnWatermark.classList.add(...inactiveClasses);
        }

        bgHint?.classList.toggle('hidden', mode !== 'background');

        // 모드 전환 시 현재 작업 초기화
        if (currentSingleItem) reset();
    }

    btnWatermark.addEventListener('click', () => applyMode('watermark'));
    btnBgRemoval.addEventListener('click', () => applyMode('background'));
}

// ──────────────────────────────────────────────
// 이벤트 리스너 설정
// ──────────────────────────────────────────────
function setupEventListeners() {
    setupModeToggle();

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // 드래그 앤 드롭
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-primary', '!bg-emerald-50/60', 'dark:!bg-emerald-900/20');
    });

    document.addEventListener('dragleave', (e) => {
        if (e.clientX === 0 && e.clientY === 0) {
            uploadArea.classList.remove('border-primary', '!bg-emerald-50/60', 'dark:!bg-emerald-900/20');
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-primary', '!bg-emerald-50/60', 'dark:!bg-emerald-900/20');
        if (e.dataTransfer.files?.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    });

    // 클립보드 붙여넣기
    document.addEventListener('paste', (e) => {
        const files = [];
        for (const item of e.clipboardData.items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                files.push(item.getAsFile());
            }
        }
        if (files.length > 0) handleFiles(files);
    });

    // 다운로드 버튼들
    document.getElementById('downloadBtn100').addEventListener('click', () => {
        if (currentSingleItem) downloadImage(currentSingleItem);
    });
    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentSingleItem) downloadImageWithQuality(currentSingleItem, parseInt(btn.dataset.quality, 10));
        });
    });

    // 배경도 제거하기 버튼 (워터마크 제거 완료 후 순차 실행)
    document.getElementById('bgRemoveFromResultBtn').addEventListener('click', async () => {
        if (!currentSingleItem?.processedBlob) return;
        const btn = document.getElementById('bgRemoveFromResultBtn');
        btn.disabled = true;
        btn.textContent = '배경 제거 중...';
        try {
            const bgBlob = await runBackgroundRemoval(currentSingleItem.processedBlob);
            if (currentSingleItem.processedUrl) URL.revokeObjectURL(currentSingleItem.processedUrl);
            currentSingleItem.processedBlob = bgBlob;
            currentSingleItem.processedUrl = URL.createObjectURL(bgBlob);
            currentSingleItem.processedMeta = { mode: 'background' };

            processedImage.src = currentSingleItem.processedUrl;
            renderSingleProcessedMeta(currentSingleItem);
            // 완료 후 버튼 숨김 (이미 배경 제거 완료)
            btn.classList.add('hidden');
            hideLoading();
        } catch (err) {
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> 배경도 제거하기`;
            setStatusMessage('배경 제거 중 오류가 발생했습니다: ' + (err.message || ''));
            console.error(err);
        }
    });

    // URL 입력으로 불러오기
    const urlInput = document.getElementById('urlInput');
    const urlSubmitBtn = document.getElementById('urlSubmitBtn');
    urlSubmitBtn.addEventListener('click', () => handleUrlInput());
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUrlInput();
    });
    urlInput.addEventListener('paste', () => {
        setTimeout(() => {
            const val = urlInput.value.trim();
            if (val) handleUrlInput();
        }, 50);
    });

    // 리셋
    document.getElementById('resetBtn').addEventListener('click', reset);
    document.getElementById('multiResetBtn').addEventListener('click', reset);
    downloadAllBtn.addEventListener('click', downloadAll);

    window.addEventListener('beforeunload', () => {
        disableWorkerClient('beforeunload');
    });
}

// ──────────────────────────────────────────────
// 리셋
// ──────────────────────────────────────────────
function reset() {
    singlePreview.style.display = 'none';
    multiPreview.style.display = 'none';
    downloadSection.classList.add('hidden');
    imageQueue = [];
    processedCount = 0;
    currentSingleItem = null;
    fileInput.value = '';
    document.getElementById('urlInput').value = '';
    setUrlError('');
    setStatusMessage('');
    // 배경 제거 버튼 초기화
    const bgBtn = document.getElementById('bgRemoveFromResultBtn');
    if (bgBtn) { bgBtn.classList.add('hidden'); bgBtn.disabled = false; }
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ──────────────────────────────────────────────
// 파일 처리
// ──────────────────────────────────────────────
function handleFileSelect(e) {
    handleFiles(Array.from(e.target.files));
}

function handleFiles(files) {
    setStatusMessage('');

    // 배경 제거 모드: 1장만 지원
    if (currentMode === 'background' && files.length > 1) {
        files = files.slice(0, 1);
    }

    const validFiles = files.filter(file => {
        if (!file.type.match('image/(jpeg|png|webp)')) return false;
        if (file.size > 20 * 1024 * 1024) return false;
        return true;
    });

    if (validFiles.length === 0) return;

    imageQueue.forEach(item => {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.processedUrl) URL.revokeObjectURL(item.processedUrl);
    });

    imageQueue = validFiles.map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        status: 'pending',
        originalImg: null,
        processedMeta: null,
        processedBlob: null,
        originalUrl: null,
        processedUrl: null
    }));

    processedCount = 0;

    if (validFiles.length === 1) {
        singlePreview.style.display = 'block';
        multiPreview.style.display = 'none';
        processSingle(imageQueue[0]);
    } else {
        singlePreview.style.display = 'none';
        multiPreview.style.display = 'block';
        imageList.innerHTML = '';
        updateProgress();
        multiPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        imageQueue.forEach(item => createImageCard(item));
        processQueue();
    }
}

// ──────────────────────────────────────────────
// 메타 표시
// ──────────────────────────────────────────────
function renderSingleImageMeta(item) {
    if (!item?.originalImg) return;

    if (currentMode === 'background') {
        originalInfo.innerHTML = `${item.originalImg.width}×${item.originalImg.height}`;
        return;
    }

    const watermarkInfo = resolveDisplayWatermarkInfo(item, getEstimatedWatermarkInfo(item));
    if (!watermarkInfo) return;
    originalInfo.innerHTML = `${item.originalImg.width}×${item.originalImg.height} · 워터마크 ${watermarkInfo.size}px`;
}

function renderSingleProcessedMeta(item) {
    if (!item?.originalImg) return;

    if (item.processedMeta?.mode === 'background') {
        processedInfo.innerHTML = `${item.originalImg.width}×${item.originalImg.height} · ✓ 배경 제거됨`;
        return;
    }

    const watermarkInfo = resolveDisplayWatermarkInfo(item, getEstimatedWatermarkInfo(item));
    const removed = isConfirmedWatermarkDecision(item);
    const statusText = removed ? '✓ 워터마크 제거됨' : '원본 유지 (워터마크 미감지)';
    processedInfo.innerHTML = `${item.originalImg.width}×${item.originalImg.height} · ${statusText}`;
}

function getCardStatusText(item) {
    if (item.status === 'pending') return '대기 중...';
    if (item.status === 'processing') return '처리 중...';
    if (item.status === 'error') return '처리 실패';
    if (item.status !== 'completed' || !item.originalImg) return '';

    const watermarkInfo = resolveDisplayWatermarkInfo(item, getEstimatedWatermarkInfo(item));
    const removed = isConfirmedWatermarkDecision(item);
    let html = `${item.originalImg.width}×${item.originalImg.height}`;
    html += watermarkInfo && removed ? ' · ✓ 워터마크 제거됨' : ' · 원본 유지';
    return html;
}

// ──────────────────────────────────────────────
// 단일 이미지 처리
// ──────────────────────────────────────────────
async function processSingle(item) {
    try {
        showLoading('처리 중...');
        const img = await loadImage(item.file);
        item.originalImg = img;
        originalImage.src = img.src;
        renderSingleImageMeta(item);

        let processedBlob;

        if (currentMode === 'background') {
            // 배경 제거 모드
            processedBlob = await runBackgroundRemoval(item.file);
            item.processedMeta = { mode: 'background' };
        } else {
            // 워터마크 제거 모드
            const processed = await processImageWithBestPath(item.file, img);
            item.processedMeta = processed.meta;
            processedBlob = processed.blob;
        }

        item.processedBlob = processedBlob;
        item.processedUrl = URL.createObjectURL(processedBlob);
        currentSingleItem = item;

        processedImage.src = item.processedUrl;
        document.getElementById('processedOverlay').style.display = 'block';
        document.getElementById('sliderHandle').style.display = 'flex';
        processedInfo.style.display = 'block';

        renderSingleProcessedMeta(item);
        downloadSection.classList.remove('hidden');

        // 워터마크 제거 완료 후 "배경도 제거하기" 버튼 표시
        const bgBtn = document.getElementById('bgRemoveFromResultBtn');
        if (bgBtn) {
            if (currentMode === 'watermark') {
                bgBtn.classList.remove('hidden');
                bgBtn.disabled = false;
                bgBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> 배경도 제거하기`;
            } else {
                bgBtn.classList.add('hidden');
            }
        }

        hideLoading();
        document.getElementById('comparisonContainer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        hideLoading();
        console.error(error);
        setStatusMessage('처리 중 오류가 발생했습니다: ' + (error.message || ''));
    }
}

// ──────────────────────────────────────────────
// 배경 제거 (동적 import — 첫 호출 시 ~60MB 모델 CDN 다운로드)
// ──────────────────────────────────────────────
async function runBackgroundRemoval(fileOrBlob) {
    showLoading('AI 모델 로딩 중... (첫 사용 시 ~60MB 다운로드)');

    const { removeBackground } = await import('@imgly/background-removal');

    return await removeBackground(fileOrBlob, {
        publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/',
        model: 'medium',
        progress: (key, current, total) => {
            if (total > 0) {
                const pct = Math.round((current / total) * 100);
                showLoading(`배경 제거 중... ${pct}%`);
            }
        },
    });
}

// ──────────────────────────────────────────────
// 다중 이미지 처리
// ──────────────────────────────────────────────
function createImageCard(item) {
    const card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden';
    card.innerHTML = `
        <div class="flex items-center gap-3 p-3">
            <div class="w-20 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden checker-bg">
                <img id="result-${item.id}" class="max-w-full max-h-full object-contain rounded" data-zoomable />
            </div>
            <div class="flex-1 min-w-0">
                <p class="image-name text-sm font-medium text-gray-800 dark:text-gray-200 truncate"></p>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5" id="status-${item.id}">대기 중...</div>
            </div>
            <div class="flex-shrink-0 flex gap-2">
                <button id="copy-${item.id}" class="hidden px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors">복사</button>
                <button id="download-${item.id}" class="hidden px-3 py-1.5 bg-gray-900 dark:bg-emerald-600 hover:bg-black dark:hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors">다운로드</button>
            </div>
        </div>
    `;
    imageList.appendChild(card);
    const imageName = card.querySelector('.image-name');
    if (imageName) {
        const safeImageName = typeof item.name === 'string' ? item.name : '';
        imageName.textContent = safeImageName;
        imageName.title = safeImageName;
    }
}

async function processQueue() {
    await Promise.all(imageQueue.map(async item => {
        const img = await loadImage(item.file);
        item.originalImg = img;
        item.originalUrl = img.src;
        document.getElementById(`result-${item.id}`).src = img.src;
        zoom.attach(`#result-${item.id}`);
    }));

    const concurrency = 3;
    for (let i = 0; i < imageQueue.length; i += concurrency) {
        await Promise.all(imageQueue.slice(i, i + concurrency).map(async item => {
            if (item.status !== 'pending') return;
            item.status = 'processing';
            updateCardStatus(item);

            try {
                const processed = await processImageWithBestPath(item.file, item.originalImg);
                item.processedMeta = processed.meta;
                item.processedBlob = processed.blob;
                item.processedUrl = URL.createObjectURL(processed.blob);
                document.getElementById(`result-${item.id}`).src = item.processedUrl;

                item.status = 'completed';
                updateCardStatus(item);

                const copyBtn = document.getElementById(`copy-${item.id}`);
                copyBtn.classList.remove('hidden');
                copyBtn.onclick = () => copyToClipboard(item, copyBtn);

                const dlBtn = document.getElementById(`download-${item.id}`);
                dlBtn.classList.remove('hidden');
                dlBtn.onclick = () => downloadImage(item);

                processedCount++;
                updateProgress();
            } catch (error) {
                item.status = 'error';
                updateCardStatus(item);
                console.error(error);
            }
        }));
    }

    if (processedCount > 0) {
        downloadAllBtn.style.display = 'flex';
    }
}

async function processImageWithBestPath(file, fallbackImage, options = {}) {
    if (workerClient) {
        try {
            return await workerClient.processBlob(file, options);
        } catch (error) {
            console.warn('워커 처리 실패, 메인 스레드로 폴백:', error);
            disableWorkerClient(error);
        }
    }
    const engine = await getEngine();
    const canvas = await engine.removeWatermarkFromImage(fallbackImage, options);
    const blob = await canvasToBlob(canvas);
    return { blob, meta: canvas.__watermarkMeta || null };
}

function updateCardStatus(item) {
    const el = document.getElementById(`status-${item.id}`);
    if (el) el.innerHTML = getCardStatusText(item);
}

function updateProgress() {
    progressText.textContent = `처리 진행: ${processedCount} / ${imageQueue.length}`;
}

// ──────────────────────────────────────────────
// 다운로드
// ──────────────────────────────────────────────
function isBgItem(item) {
    return item?.processedMeta?.mode === 'background';
}

function downloadImage(item) {
    const prefix = isBgItem(item) ? 'bg-removed' : 'unwatermarked';
    const a = document.createElement('a');
    a.href = item.processedUrl;
    a.download = `${prefix}_${item.name.replace(/\.[^.]+$/, '')}.png`;
    a.click();
}

async function downloadImageWithQuality(item, qualityPercent) {
    if (!item.processedBlob) return;

    const usePng = isBgItem(item); // 투명 배경은 PNG로 저장
    const prefix = isBgItem(item) ? 'bg-removed' : 'unwatermarked';
    const ext = usePng ? 'png' : 'jpg';
    const mimeType = usePng ? 'image/png' : 'image/jpeg';
    const quality = usePng ? undefined : 0.92;

    const objectUrl = URL.createObjectURL(item.processedBlob);
    const img = new Image();

    img.onload = () => {
        const scale = qualityPercent / 100;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${prefix}_${item.name.replace(/\.[^.]+$/, '')}_${qualityPercent}pct.${ext}`;
            a.click();
        }, mimeType, quality);
    };

    img.src = objectUrl;
}

async function copyToClipboard(item, btn) {
    if (!navigator.clipboard || !window.ClipboardItem) {
        setStatusMessage('브라우저가 클립보드 복사를 지원하지 않습니다.');
        return;
    }
    try {
        if (!item.processedBlob) return;
        await navigator.clipboard.write([new ClipboardItem({ [item.processedBlob.type]: item.processedBlob })]);
        const prev = btn.textContent;
        btn.textContent = '복사됨!';
        setTimeout(() => { btn.textContent = prev; }, 2000);
    } catch (err) {
        console.error('복사 실패:', err);
        setStatusMessage('복사에 실패했습니다.');
    }
}

async function downloadAll() {
    const completed = imageQueue.filter(item => item.status === 'completed');
    if (completed.length === 0) return;

    const zip = new JSZip();
    completed.forEach(item => {
        const prefix = isBgItem(item) ? 'bg-removed' : 'unwatermarked';
        zip.file(`${prefix}_${item.name.replace(/\.[^.]+$/, '')}.png`, item.processedBlob);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `images_${Date.now()}.zip`;
    a.click();
}

// ──────────────────────────────────────────────
// URL 이미지 로딩
// ──────────────────────────────────────────────
function setUrlError(msg) {
    const el = document.getElementById('urlError');
    if (!el) return;
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else { el.textContent = ''; el.classList.add('hidden'); }
}

function setUrlLoading(loading) {
    const btn = document.getElementById('urlSubmitBtn');
    const input = document.getElementById('urlInput');
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> 로딩 중...`;
        input.disabled = true;
    } else {
        btn.disabled = false;
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg> 불러오기`;
        input.disabled = false;
    }
}

const GEMINI_URL_PATTERNS = [
    /^https?:\/\/(www\.)?gemini\.google\.com\//i,
    /^https?:\/\/g\.co\/gemini\//i,
    /^https?:\/\/googleusercontent\.com\/image_generation_content\//i,
];

function isGeminiUrl(url) {
    return GEMINI_URL_PATTERNS.some(re => re.test(url));
}

async function handleUrlInput() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    setUrlError('');

    if (!url) return;

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            setUrlError('http 또는 https URL만 지원합니다.');
            return;
        }
    } catch {
        setUrlError('올바른 URL 형식이 아닙니다.');
        return;
    }

    if (isGeminiUrl(url)) {
        setUrlError('Gemini 이미지는 Google 로그인 세션이 필요해서 URL로 직접 불러올 수 없습니다. 이미지를 우클릭 → [다른 이름으로 이미지 저장] 후 파일로 업로드해 주세요.');
        return;
    }

    setUrlLoading(true);
    try {
        const file = await fetchImageFromUrl(url);
        handleFiles([file]);
        urlInput.value = '';
    } catch (err) {
        setUrlError(err.message || '이미지를 불러오지 못했습니다.');
    } finally {
        setUrlLoading(false);
    }
}

async function fetchImageFromUrl(url) {
    const rawName = new URL(url).pathname.split('/').pop() || 'image';
    const name = rawName.includes('.') ? rawName : rawName + '.jpg';

    // 1차: 브라우저 직접 fetch
    try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('이미지 파일이 아닙니다.');
        return new File([blob], name, { type: blob.type });
    } catch (fetchErr) {
        console.warn('1차(fetch) 실패:', fetchErr);
    }

    // 2차: img + canvas
    try {
        const file = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (!blob) return reject(new Error('blob 변환 실패'));
                        resolve(new File([blob], name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }));
                    }, 'image/png');
                } catch { reject(new Error('canvas tainted')); }
            };
            img.onerror = () => { clearTimeout(timeout); reject(new Error('img load error')); };
            img.src = url;
        });
        return file;
    } catch (canvasErr) {
        console.warn('2차(canvas) 실패:', canvasErr);
    }

    // 3차: 서버 프록시
    const proxyUrl = `/api/fetch-image?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl);
    if (!proxyRes.ok) {
        let errMsg = `서버 오류 ${proxyRes.status}`;
        try { const body = await proxyRes.json(); if (body.error) errMsg = body.error; } catch { /* ignore */ }
        throw new Error(errMsg);
    }
    const contentType = (proxyRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
    if (!contentType.startsWith('image/')) throw new Error('이미지를 가져오지 못했습니다. URL을 확인해 주세요.');
    const blob = await proxyRes.blob();
    return new File([blob], name.replace(/\.[^.]+$/, '.png'), { type: contentType });
}

// ──────────────────────────────────────────────
// 다크모드 / 슬라이더
// ──────────────────────────────────────────────
function setupDarkMode() {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
    }

    themeToggle.addEventListener('click', () => {
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            localStorage.theme = 'light';
        } else {
            html.classList.add('dark');
            localStorage.theme = 'dark';
        }
    });
}

function setupSlider() {
    const container = document.getElementById('comparisonContainer');
    const overlay = document.getElementById('processedOverlay');
    const handle = document.getElementById('sliderHandle');
    let isDown = false;

    function move(e) {
        if (!isDown) return;
        const rect = container.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX;
        if (clientX == null) return;
        const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * 100;
        overlay.style.width = `${percent}%`;
        handle.style.left = `${percent}%`;
    }

    container.addEventListener('mousedown', (e) => { isDown = true; move(e); });
    window.addEventListener('mouseup', () => { isDown = false; });
    window.addEventListener('mousemove', move);
    container.addEventListener('touchstart', (e) => { isDown = true; move(e); }, { passive: true });
    window.addEventListener('touchend', () => { isDown = false; });
    window.addEventListener('touchmove', move, { passive: true });
}

init();
