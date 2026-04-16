# gemini-watermark-remover — 프로젝트 지시사항

## 프로젝트 개요

GargantuaX의 오픈소스 Gemini 워터마크 제거 도구를 포크하여 한국어 UI + 추가 기능을 붙인 커스텀 빌드.
배포는 **Vercel** (기본) + **Cloudflare Workers** (선택).

- 공식 업스트림: https://github.com/GargantuaX/gemini-watermark-remover
- 현재 버전: `1.0.10` (package.json 기준)

## 아키텍처

```
src/
  app.js                  # 메인 UI 진입점 (모드 토글, 이벤트, 배경 제거 포함)
  core/                   # 워터마크 엔진 (역 알파 블렌딩 알고리즘)
  userscript/             # Tampermonkey 유저스크립트 (Gemini 페이지 자동 처리)
  sdk/                    # SDK 진입점 (browser / node / image-data)
  workers/                # Web Worker (watermarkWorker.js)
  cli/                    # CLI (gwrCli.js, gwrRemoveCommand.js)
  shared/                 # 공용 유틸 (imageProcessing, domAdapter 등)
  i18n/                   # 다국어 (ko-KR, en-US, zh-CN, pt-BR)
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
| 배경 제거 — 색상 | BFS flood fill 방식 | `src/app.js` setupBgSubModeToggle |
| 배경 제거 — AI | @imgly/background-removal (isnet 모델) | `src/app.js` |
| 이미지 용량 축소 다운로드 | 다운로드 시 압축 적용 | `src/app.js` |

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
| `@imgly/background-removal` ^1.7.0 | AI 배경 제거 (isnet 모델, CDN: jsDelivr) |
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

- **모델**: `isnet` (풀프리시전, rembg 동급 품질) — `medium`(isnet_fp16)에서 업그레이드됨
- **CDN**: jsDelivr 기본 (`staticimgly.com`) — `publicPath` 제거 후 기본값 사용
- **서브모드**: `color` (BFS flood fill, 빠름) / `ai` (@imgly/background-removal, 고품질)

## 코드 작업 체크리스트

- [ ] 배경 제거 AI 모드: CDN 로딩 오류 시 jsDelivr 기본값 확인 (publicPath 설정 금지)
- [ ] URL 프록시(`api/fetch-image.js`): SSRF 방지 — http/https만 허용, 25MB 제한 유지
- [ ] 빌드 후 `dist/` 디렉토리 존재 확인 (`pnpm build` 성공 여부)
- [ ] Vercel 자동 배포 확인 (main 푸시 시 CI 트리거)
- [ ] 업스트림 변경 병합 시 한국어 UI 커스텀 파일 충돌 확인

## 주의사항

- `wrangler.toml`은 Cloudflare 배포용 — 로컬 테스트/소스 임포트에 없어도 유지할 것
- Canvas Fingerprint Defender 등 확장 프로그램이 있으면 처리 오류 발생 가능 (사용자 안내 필요)
- `pnpm dev` 포트: `4173`에서 시작, 충돌 시 자동 증가 — 출력값 확인할 것 (4173 하드코딩 금지)
- `.env` 파일은 Git에 절대 포함하지 않을 것
