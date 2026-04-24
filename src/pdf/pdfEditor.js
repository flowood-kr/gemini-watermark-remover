// ──────────────────────────────────────────────
// PDF 페이지 편집 모듈 (재정렬/삭제)
// pdf-lib 기반 — 원본 페이지 바이트 그대로 복사하므로 무손실
// ──────────────────────────────────────────────

let pdfLibPromise = null;

async function getPdfLib() {
    if (!pdfLibPromise) {
        pdfLibPromise = import('pdf-lib').catch((err) => {
            pdfLibPromise = null;
            throw err;
        });
    }
    return pdfLibPromise;
}

// 원본 PDF ArrayBuffer를 보존해두고, 편집 작업은 페이지 인덱스 배열로만 관리한다.
// (copyPages가 매번 원본에서 복사하므로, pageOrder 배열만 바꾸면 순서·삭제 모두 표현 가능)
export class PdfEditor {
    constructor(arrayBuffer, pageCount) {
        this.arrayBuffer = arrayBuffer;
        this.pageCount = pageCount;
        // 0-based 원본 페이지 인덱스 배열 — 순서 변경/삭제의 상태
        this.pageOrder = Array.from({ length: pageCount }, (_, i) => i);
    }

    get currentPageOrder() {
        return [...this.pageOrder];
    }

    get currentPageCount() {
        return this.pageOrder.length;
    }

    // 페이지를 srcIdx → dstIdx 위치로 이동
    movePage(srcIdx, dstIdx) {
        if (srcIdx < 0 || srcIdx >= this.pageOrder.length) return;
        if (dstIdx < 0 || dstIdx >= this.pageOrder.length) return;
        const [moved] = this.pageOrder.splice(srcIdx, 1);
        this.pageOrder.splice(dstIdx, 0, moved);
    }

    // 현재 배열의 idx 위치 페이지 삭제
    removePage(idx) {
        if (idx < 0 || idx >= this.pageOrder.length) return;
        this.pageOrder.splice(idx, 1);
    }

    // 현재 pageOrder 기준으로 새 PDF 생성
    async save() {
        if (this.pageOrder.length === 0) {
            throw new Error('페이지가 1장 이상 남아있어야 합니다.');
        }
        const { PDFDocument } = await getPdfLib();
        const srcDoc = await PDFDocument.load(this.arrayBuffer.slice(0));
        const outDoc = await PDFDocument.create();
        const copied = await outDoc.copyPages(srcDoc, this.pageOrder);
        copied.forEach((page) => outDoc.addPage(page));
        const bytes = await outDoc.save();
        return new Blob([bytes], { type: 'application/pdf' });
    }
}

export async function createPdfEditor(fileOrArrayBuffer) {
    const { PDFDocument } = await getPdfLib();
    const ab = fileOrArrayBuffer instanceof ArrayBuffer
        ? fileOrArrayBuffer
        : await fileOrArrayBuffer.arrayBuffer();
    const doc = await PDFDocument.load(ab.slice(0));
    return new PdfEditor(ab, doc.getPageCount());
}
