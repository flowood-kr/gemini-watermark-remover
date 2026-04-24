# WORKLOG

## 2026-04-24 — PDF 도구 모드 추가

### 유형
feat (신규 기능)

### 영향 범위
- 메인 모드 토글에 "📄 PDF 도구" 추가 (워터마크/배경제거와 동일 레벨)
- 서브모드: 🖼️ 이미지 변환 / ✂️ 페이지 편집
- 새 모듈: `src/pdf/pdfToImages.js`, `src/pdf/pdfEditor.js`
- 신규 의존성: `pdfjs-dist@5.6.205` (PDF 렌더링), `pdf-lib@1.17.1` (PDF 편집)

### 내용
1. **이미지 변환 (PDF → PNG/JPG)**
   - 포맷 선택: PNG(무손실) / JPG(용량 작음, 품질 0.95)
   - DPI 선택: 150 / 300(기본) / 600
   - 각 페이지 개별 다운로드 + 전체 ZIP 다운로드
   - pdfjs-dist로 canvas 렌더링 (scale = DPI / 72)

2. **페이지 편집 (순서 변경 / 삭제)**
   - 썸네일 그리드 (HTML5 draggable로 재정렬)
   - 각 페이지 × 버튼으로 삭제 (마지막 1장은 삭제 방지)
   - pdf-lib `copyPages`로 원본 페이지 바이트 무손실 복사 후 재저장
   - 파일명: `{원본}_edited.pdf`

3. **번들 최적화**
   - pdfjs-dist, pdf-lib, `src/pdf/*` 모두 **동적 import** → 청크 분리
   - 초기 번들 크기 영향 없음 (PDF 모드 진입 시에만 로드)
   - PDF 파일 크기 제한: 50MB (메모리 보호)
   - pdfjs 워커: jsDelivr CDN에서 버전 자동 매칭

### 주의사항
- pdfjs 워커가 jsDelivr CDN을 요구 → 오프라인 환경에서는 동작 불가 (배경제거 AI 모델과 동일한 트레이드오프)
- PDF 편집 시 원본 ArrayBuffer를 메모리에 유지 → 50MB 제한 반드시 준수
- PDF 모드에서는 기존 이미지 드래그/클립보드 붙여넣기 비활성화

### 파일
- `src/pdf/pdfToImages.js` (신규, 94줄)
- `src/pdf/pdfEditor.js` (신규, 62줄)
- `src/app.js` (+320줄, 모드 로직 + PDF 핸들러)
- `public/index.html` (+100줄, UI)
- `package.json` (+2개 의존성)
