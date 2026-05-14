# gemini-watermark-remover — 프로젝트 지시사항

## 프로젝트 개요

GargantuaX의 오픈소스 Gemini 워터마크 제거 도구를 포크하여 한국어 UI + 추가 기능을 붙인 커스텀 빌드.
배포는 **Vercel** (기본) + **Cloudflare Workers** (선택).

- 공식 업스트림: https://github.com/GargantuaX/gemini-watermark-remover
- 현재 버전: `1.0.10` (package.json 기준)

## 아키텍처

```
src/
  app.js                  # 메인 UI 진입점 (모드 토글, 이벤트, 배경 제거, PDF 도구 포함)
  core/                   # 워터마크 엔진 (역 알파 블렌딩 알고리즘)
  bg/                     # 배경 제거 모듈 (transformersRemover — BiRefNet-lite) — 동적 import
  pdf/                    # PDF 도구 모듈 (pdfToImages, pdfEditor) — 동적 import
  userscript/             # Tampermonkey 유저스크립트 (Gemini 페이지 자동 처리)
  sdk/                    # SDK 진입점 (browser / node / image-data)
  workers/                # Web Worker (watermarkWorker.js)
  cli/                    # CLI (gwrCli.js, gwrRemoveCommand.js)
  shared/                 # 공용 유틸 (imageProcessing, domAdapter 등)
  i18n/                   # 다국어 (ko-KR, en-US, zh-CN, pt-BR) — userscript 전용
api/
  fetch-image.js          # Vercel Serverless Function — 이미지 CORS 프록시
bin/
  gwr.mjs                 # CLI 엔트리포인트 (`gwr remove`)
skills/
  gemini-watermark-remover/  # Claude Agent SDK Skill 패키지
dist/                     # 빌드 산출물 (git 제외)
```

## 핵심 기능 (Roy 추가분)

| 기능 | 설명 | 관련 파일 |
|------|------|-----------|
| 한국어 전용 UI | 기본 언어 ko-KR, 심플 디자인 | `src/i18n/ko-KR.json`, `src/app.js` |
| URL 붙여넣기 | 이미지 URL 직접 입력 처리 | `src/app.js` |
| Gemini 공유 링크 지원 | og:image 추출 후 서버 프록시 | `api/fetch-image.js` |
| 배경 제거 — 색상 | BFS flood fill 방식 | `src/app.js` + `src/shared/edgeFeathering.js` |
| 배경 제거 — AI (빠름 · isnet) | @imgly/background-removal `large`+WebGPU, ~80MB | `src/app.js` runIsnetRemoval |
| 배경 제거 — AI (고품질 · BiRefNet-lite) | @huggingface/transformers v4 (MIT 모델), ~180MB, WebGPU 우선 | `src/bg/transformersRemover.js` |
| AI 결과 엣지 페더링 | distance 모드 알파 감쇠 — 계단현상 완화 | `src/shared/edgeFeathering.js` |
| 이미지 용량 축소 다운로드 | 다운로드 시 압축 적용 | `src/app.js` |
| PDF → 이미지 변환 | pdfjs-dist 기반, PNG/JPG + 150/300/600 DPI, ZIP 다운로드 | `src/pdf/pdfToImages.js` |
| PDF 페이지 편집 | pdf-lib 기반, 드래그 재정렬 + 삭제, 무손실 재저장 | `src/pdf/pdfEditor.js` |
| 즉시 접속 | 초기 접속 비밀번호 게이트 제거, 접속 즉시 사용 | `src/app.js`, `public/index.html` |
| 99PAGE 상단 배너 | 데스크톱/모바일 GIF 배너, `page-e.net` sponsor 링크 | `public/index.html`, `public/assets/99page-banner*.gif` |

## 배포

### Vercel (기본)
```bash
# 자동 배포: main 푸시 시 Vercel CI 트리거
# 수동 배포:
vercel --prod
```
- `vercel.json`: `buildCommand: "node build.js --prod"`, `outputDirectory: "dist"`
- API Routes: `/api/*` → `api/` 폴더의 Serverless Functions

### Cloudflare Workers (선택)
```bash
wrangler publish
```
- `wrangler.toml`: `directory = "./dist"`, `compatibility_date = "2025-01-16"`

## 빌드 & 개발

```bash
pnpm install          # 의존성 설치
pnpm dev              # 개발 서버 (http://127.0.0.1:4173/ 시작, 포트 충돌 시 자동 증가)
pnpm build            # 프로덕션 빌드 → dist/
pnpm test             # 전체 테스트
pnpm test:sdk-smoke   # SDK 스모크 테스트
pnpm benchmark:samples  # 샘플 벤치마크
```

## 주요 의존성

| 패키지 | 용도 |
|--------|------|
| `@imgly/background-removal` ^1.7.0 | AI 배경 제거 — 빠름(isnet 모델, CDN: jsDelivr) |
| `@huggingface/transformers` ^4.2.0 | AI 배경 제거 — 고품질(BiRefNet-lite, HuggingFace CDN, WebGPU 지원) |
| `pdfjs-dist` ^5.6.205 | PDF 렌더링 (이미지 변환, 워커: jsDelivr CDN) |
| `pdf-lib` ^1.17.1 | PDF 편집 (페이지 재정렬/삭제 무손실 재저장) |
| `jszip` ^3.10.1 | ZIP 다운로드 |
| `medium-zoom` ^1.1.0 | 이미지 줌 |
| `sharp` ^0.34.5 | Node.js 이미지 처리 (CLI/SDK) |
| `esbuild` ^0.24.0 | 번들러 |
| `playwright` ^1.58.2 | E2E 테스트 |

## Tampermonkey 디버깅 (macOS)

```bash
pnpm build
./scripts/open-fixed-chrome-profile.sh --url https://gemini.google.com/app
# 고정 프로필: .chrome-debug/tampermonkey-profile
# CDP 포트: 9226  /  프록시: http://127.0.0.1:7890 (off 옵션: --proxy off)
```

## 배경 제거 모델 설정

- **서브모드**: `color` (BFS flood fill, 즉시) / `ai` (모델 선택형)
- **AI 모델 선택** (`bgAiModel`):
  - `isnet` — @imgly/background-removal `large` (~80MB, WebGPU 가속, `device: 'gpu'` 명시)
  - `birefnet` — `onnx-community/BiRefNet_lite-ONNX` via transformers.js (MIT, ~180MB, WebGPU 우선)
- **CDN**: jsDelivr 기본 (`staticimgly.com`) — `publicPath` 제거 후 기본값 사용. transformers.js는 HuggingFace Hub 기본 캐시 사용 (별도 publicPath 설정 금지)
- **AI 결과 후처리**: distance 페더링 (`src/shared/edgeFeathering.js`, radius=2) — 계단현상 완화
- **다운로드 동의 모달**: BiRefNet 첫 선택 시 ~180MB 다운로드 안내, `localStorage.gwr_birefnet_lite_downloaded` 로 캐시 기록 → 다음부터 즉시 활성화
- **라이선스 주의**: RMBG-1.4 (briaai) 는 비상용 라이선스 → 채택 제외. BiRefNet (MIT) 만 사용

## PDF 도구 설정

- **워커 CDN**: `https://cdn.jsdelivr.net/npm/pdfjs-dist@{version}/build/pdf.worker.min.mjs` — 설치된 pdfjs 버전과 자동 일치
- **파일 크기 제한**: 50MB (`PDF_MAX_BYTES` in `src/app.js`)
- **편집 무손실 원칙**: pdf-lib `copyPages`로 원본 페이지 바이트 그대로 복사 — 화질 손실 없음
- **청크 분리**: `src/pdf/*`, `pdfjs-dist`, `pdf-lib` 모두 동적 import → 초기 번들 영향 없음

## 코드 작업 체크리스트

- [ ] 배경 제거 AI 모드: CDN 로딩 오류 시 jsDelivr 기본값 확인 (publicPath 설정 금지)
- [ ] URL 프록시(`api/fetch-image.js`): SSRF 방지 — http/https만 허용, 25MB 제한 유지
- [ ] 빌드 후 `dist/` 디렉토리 존재 확인 (`pnpm build` 성공 여부)
- [ ] 99PAGE 배너 수정 시 데스크톱/모바일 GIF 둘 다 갱신하고 `build.js`의 `.gif` MIME 유지
- [ ] PDF 모드: 청크 분리 확인 (`dist/chunks/pdf-*.js`, `dist-*.js` 존재)
- [ ] AI 모델 청크 분리: `dist/chunks/transformers.web-*.js`, `transformersRemover-*.js` 존재 (BiRefNet 모드 시에만 로드)
- [ ] 신규 AI 모델 추가 시 라이선스 확인 — 상용 가능 라이선스(MIT/Apache 2.0)만 채택
- [ ] Vercel 자동 배포 확인 (main 푸시 시 CI 트리거)
- [ ] 업스트림 변경 병합 시 한국어 UI 커스텀 파일 충돌 확인

## 주의사항

- `wrangler.toml`은 Cloudflare 배포용 — 로컬 테스트/소스 임포트에 없어도 유지할 것
- Canvas Fingerprint Defender 등 확장 프로그램이 있으면 처리 오류 발생 가능 (사용자 안내 필요)
- `pnpm dev` 포트: `4173`에서 시작, 충돌 시 자동 증가 — 출력값 확인할 것 (4173 하드코딩 금지)
- `.env` 파일은 Git에 절대 포함하지 않을 것
