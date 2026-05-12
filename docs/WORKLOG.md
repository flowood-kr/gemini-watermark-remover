# WORKLOG

## 2026-05-12 — 배경 제거 품질 개선: BiRefNet-lite 모델 추가 + 엣지 페더링

### 에이전트
Claude

### 유형
feat (신규 기능) + perf (품질 개선)

### 영향 범위
- AI 배경 제거 모드에 **모델 선택 토글** 추가 (`⚡ 빠름 / ✨ 고품질`)
- 신규 의존성: `@huggingface/transformers@^4.2.0`
- 신규 모듈: `src/bg/transformersRemover.js`, `src/shared/edgeFeathering.js`
- 수정: `src/app.js`, `public/index.html`, `CLAUDE.md`, `package.json`

### 내용
1. **BiRefNet-lite 고품질 모델 도입 (MIT 라이선스)**
   - 모델 ID: `onnx-community/BiRefNet_lite-ONNX` (~180MB)
   - SOTA 근접 품질, 머리카락·털·복잡한 외곽선·반투명 배경에 강함
   - WebGPU 우선, 미지원 시 WASM 자동 폴백
   - 첫 사용 시 다운로드 동의 모달 → `localStorage` 캐시 기록 후 즉시 활성화

2. **기존 isnet (@imgly/background-removal) 옵션 강화**
   - `device: 'gpu'` 명시로 WebGPU 가속 활성화
   - `output: { format: 'image/png', quality: 1.0 }` 명시

3. **엣지 페더링 후처리 적용 (계단현상 완화)**
   - 공용 모듈 `src/shared/edgeFeathering.js` 신설
   - `distance` 모드 (radius=2): AI 마스크 결과의 알파 거리 기반 감쇠 — 양 AI 모델 모두 적용
   - `color` 모드: 기존 색상 BFS 모드 후처리 (인라인 → 공용 함수로 이관)

4. **rembg 직접 도입 검토 → 채택 보류**
   - Vercel Serverless Python 250MB 한도 / 별도 Python 서버는 "비용 0원" 원칙 위배
   - rembg vs @imgly 품질 차이는 라이브러리가 아닌 **모델 선택**에서 발생 (둘 다 ONNX Runtime 래퍼)
   - 결론: 같은 효과를 transformers.js + BiRefNet-lite로 브라우저에서 달성

5. **UI 추가**
   - `bgAiModelRow`: AI 서브모드 활성 시 노출되는 모델 토글
   - `modelConsentModal`: 첫 BiRefNet 선택 시 다운로드 안내 모달

### 청크 분리 검증
- `dist/chunks/transformers.web-*.js` (439KB) — transformers.js 라이브러리 (동적 로드)
- `dist/chunks/transformersRemover-*.js` (2.4KB) — 우리 래퍼
- 메인 `dist/app.js` 249KB → 기존 대비 미세 증가 (UI 코드만 추가, BiRefNet 코드는 동적 import)

### 주의사항
- **RMBG-1.4 (briaai) 라이선스**: WebFetch 결과 비상용 라이선스 — 채택 제외. 향후 추가 모델 검토 시 라이선스 확인 필수
- **모델 캐시 키**: `localStorage.gwr_birefnet_lite_downloaded` — 이 키가 있으면 모달 생략
- **transformers.js publicPath**: HuggingFace Hub 기본 CDN 사용. 별도 설정 금지 (배경제거 메모리 원칙과 동일)
- **WebGPU 미지원 브라우저**: 자동 WASM 폴백, 추론 속도는 더 느림

### 파일
- `src/bg/transformersRemover.js` (신규, 167줄)
- `src/shared/edgeFeathering.js` (신규, 132줄)
- `src/app.js` (수정: AI 모델 분기, UI 토글, 모달 핸들러)
- `public/index.html` (수정: 모델 선택 토글, 동의 모달)
- `CLAUDE.md` (수정: 모델 옵션·청크 표·라이선스 주의)
- `package.json` (수정: `@huggingface/transformers` 추가)

---

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
