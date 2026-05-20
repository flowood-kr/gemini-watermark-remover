# WORKLOG

## 2026-05-20 — Google Search Console sitemap 이미지 네임스페이스 수정

### 에이전트
Codex

### 유형
fix (Search Console sitemap 오류 수정)

### 영향 범위
- sitemap 이미지 확장 네임스페이스 수정 (`public/sitemap.xml`)
- 정적 SEO 회귀 테스트 보강 (`tests/regression/staticSeo.test.js`)

### 내용
- Google Search Console에서 `/sitemap.xml` 제출 후 `XML 태그가 잘못되었습니다`, `XML 태그 누락`, `네임스페이스가 잘못되었습니다` 오류가 표시됨
- 원인은 image sitemap 확장 namespace가 Google 기준 `http://www.google.com/schemas/sitemap-image/1.1`이어야 하는데 `0.9`로 설정되어 있었기 때문
- sitemap image namespace를 `1.1`로 수정하고, 다시 `0.9`로 회귀하지 않도록 테스트 추가

### 검증
- `node --test tests/regression/staticSeo.test.js` 성공

---

## 2026-05-20 — PixKit 검색 최적화(AEO/SEO/GEO) 정리

### 에이전트
Codex

### 유형
seo (AEO/SEO/GEO, 정적 문서, 검증)

### 영향 범위
- 홈페이지 SEO 메타·구조화 데이터 수정 (`public/index.html`)
- 대표 도메인 정합성 수정 (`public/robots.txt`, `public/sitemap.xml`)
- 정책 문서 추가·개편 (`public/terms.html`, `public/privacy.html`)
- AI 답변 엔진용 요약 파일 추가 (`public/llms.txt`)
- 공유 썸네일 문구·도메인 갱신 (`public/assets/pixkit-og.svg`, `public/assets/pixkit-og.png`)
- 정적 SEO 회귀 테스트 추가 (`tests/regression/staticSeo.test.js`)
- 프로젝트 문서 동기화 (`CLAUDE.md`, `docs/WORKLOG.md`)

### 내용
- 라이브 도메인 `https://www.pixkit.kr/` 기준으로 canonical, hreflang, Open Graph, Twitter Card, JSON-LD `@id`, robots Sitemap, sitemap URL을 통일
- Google/Naver 검색 노출을 위해 제목·description을 "무료 이미지·PDF 도구 / 배경 제거 / PDF 변환 / 워터마크 제거" 검색 의도에 맞게 재작성
- WebPage + WebApplication + Organization 구조화 데이터를 보강하고, 기존 FAQPage/HowTo 스키마를 www 대표 URL로 정리
- 홈페이지 본문에 대표 기능·처리 방식·권장 사용자 요약을 추가해 AEO/GEO 답변 인용에 필요한 명시 문맥 보강
- 기존 영어·구브랜드 약관 페이지를 PixKit 한국어 이용약관으로 개편하고, 개인정보 처리방침 페이지를 신규 추가
- `llms.txt`를 추가해 AI 답변 엔진이 PixKit의 기능, 개인정보 원칙, 대표 인용 URL을 빠르게 파악하도록 구성
- 공유 이미지의 헤드라인을 "무료 이미지·PDF 도구 모음"으로 정리하고 도메인 표기를 `www.pixkit.kr`로 갱신
- 검색 메타 URL 정합성, JSON-LD 파싱, sitemap/robots, 정책 페이지 색인 메타를 검증하는 정적 테스트 추가

### 검증
- `node --test tests/regression/staticSeo.test.js tests/regression/comparisonPortraitLayout.test.js` 성공
- `pnpm build` 성공
- 빌드 산출물 `dist/`에서 `index.html`, `robots.txt`, `sitemap.xml`, `terms.html`, `privacy.html`, `llms.txt` 반영 확인
- Vercel 프로덕션 배포 성공: `dpl_BAu6nNxq4CDz9E3rDGbcUqdxDrhm`, alias `https://www.pixkit.kr`
- 라이브 확인: `/`, `/robots.txt`, `/sitemap.xml`, `/privacy.html`, `/llms.txt` 200 응답 및 www canonical/sitemap 반영 확인
- `pnpm test`는 기존 i18n 런타임 테스트 2건 실패로 전체 통과하지 않음 (`src/i18n.js`의 현재 fallback/locale rotation 동작과 테스트 기대값 불일치, 이번 SEO 변경 파일은 아님)
- Playwright 스크린샷 검증은 로컬 브라우저 바이너리 미설치로 수행하지 못함

### 주의사항
- 대표 URL은 `https://www.pixkit.kr/`로 유지해야 하며, apex URL과 canonical/sitemap이 섞이면 네이버·구글 중복 URL 신호가 약해질 수 있음
- `llms.txt`는 GEO 보조 파일이며 Google/Naver의 공식 ranking 보장 신호가 아니므로, 본문·schema·sitemap 정합성을 우선 유지할 것

---

## 2026-05-14 — PixKit SNS 공유 메타·썸네일 추가

### 에이전트
Codex

### 유형
marketing (OG/Twitter 메타 및 공유 이미지)

### 영향 범위
- SNS 공유 메타 태그 수정 (`public/index.html`)
- PixKit 공유 썸네일 추가 (`public/assets/pixkit-og.svg`, `public/assets/pixkit-og.png`)

### 내용
- `pixkit.kr` 공유 기준 canonical, Open Graph, Twitter Card 메타 태그 추가
- 공유 제목을 `PixKit | 이미지·PDF 작업을 브라우저에서 바로`로 정리
- 설명 문구에 무료, 회원가입 없음, 브라우저 처리, 서버 미업로드 메시지 반영
- 1200×630 규격 공유 썸네일을 PixKit 다크 UI와 민트 브랜드 컬러에 맞춰 제작

### 검증
- `pnpm build` 성공
- 로컬 정적 서버에서 HTML 메타 태그 노출 확인
- 로컬 정적 서버에서 `/assets/pixkit-og.png` 200 OK 및 `image/png` 응답 확인

---

## 2026-05-14 — 헤더 99PAGE CTA 문구 수정

### 에이전트
Codex

### 유형
copy (CTA 문구 수정)

### 영향 범위
- 헤더 우측 99PAGE CTA 문구 수정 (`public/index.html`)

### 내용
- 기존 `99PAGE 상담` 문구를 `홈페이지 기획・제작・운영 | 99PAGE 상담`으로 변경
- 긴 문구가 모바일 헤더에서 줄바꿈되지 않도록 `whitespace-nowrap`와 반응형 글자 크기 적용

### 검증
- `pnpm build` 성공

---

## 2026-05-14 — 99PAGE 배너 폭·카피·스크롤 UX 개선

### 에이전트
Codex

### 유형
design (배너 UX 개선)

### 영향 범위
- 99PAGE 데스크톱/모바일 GIF 재제작 (`public/assets/99page-banner.gif`, `public/assets/99page-banner-mobile.gif`)
- 배너 레이아웃 조정 (`public/index.html`)
- 문서 동기화 (`CLAUDE.md`, `docs/WORKLOG.md`)

### 내용
1. **본문 폭과 배너 폭 통일**
   - 배너 컨테이너를 `max-w-4xl` → `max-w-5xl`로 변경
   - 아래 주요 콘텐츠 카드와 같은 폭으로 정렬해 화면 구조 통일

2. **배너 카피 정리**
   - 좌측 보조 문구 "홈페이지 제작은 가볍게 시작하세요" 삭제
   - 중앙 카피를 "홈페이지 제작, 월 9만 9천원" / "기획·디자인·제작·운영을 한 번에 시작하세요"로 재정리
   - CTA 아래 `page-e.net` 노출 문구 삭제

3. **스크롤 중 콘텐츠 가림 해결**
   - 큰 GIF 배너의 `sticky` 동작 제거
   - 스크롤 후 상시 노출은 헤더 오른쪽의 작은 `99PAGE` CTA로 대체
   - 큰 광고가 작업 영역을 덮지 않고, sponsor 링크 노출은 유지

### 검증
- `pnpm build` 성공
- 로컬 브라우저 검증: 데스크톱 첫 화면에서 배너와 본문 폭 정렬 확인
- 로컬 브라우저 검증: 스크롤 후 큰 배너가 사라지고 헤더 CTA만 남아 콘텐츠를 가리지 않음
- 로컬 브라우저 검증: 390px 모바일에서 배너와 헤더 CTA 노출 확인

### 주의사항
- 큰 배너를 다시 sticky 처리하면 작업 영역을 가리는 문제가 재발한다.
- 상시 노출은 헤더 CTA로 처리하고, 큰 GIF는 첫 화면 sponsor 영역으로만 유지한다.

---

## 2026-05-14 — 프라이버시 안내문 UI 추가

### 에이전트
Claude

### 유형
design (UX 신뢰성 강화)

### 영향 범위
- 업로드 박스 내부 프라이버시 배지 추가 (`public/index.html`)
- 페이지 하단 개인정보 안내 푸터 신설 (`public/index.html`)
- 문서 동기화 (`CLAUDE.md` 핵심 기능 표, `docs/WORKLOG.md`)

### 내용
1. **업로드 박스 내부 프라이버시 배지**
   - 모드 토글 그룹과 드래그앤드랍 영역 사이에 자물쇠 아이콘 + 한 줄 안내 배치
   - 카피: "파일은 이 브라우저 안에서만 처리됩니다. 서버로 업로드되거나 저장되지 않습니다."
   - 모든 모드(워터마크 / 배경 제거 / PDF)에서 공통 노출

2. **페이지 하단 개인정보 안내 푸터**
   - `</main>` 뒤에 신설 (이전엔 푸터 자체가 없었음)
   - 카피: "업로드하신 파일은 우리 서버에 저장되지 않습니다. 이미지·PDF의 모든 처리는 브라우저 안에서 실행되며, 다운로드 결과물 역시 로컬에서 생성됩니다."

### 사실 근거 (코드 검증)
- `<input type="file">` 입력은 FileReader/Blob/Canvas로만 처리, 서버 전송 없음
- 유일한 서버 경로 `api/fetch-image.js` 는 URL 붙여넣기 시 CORS 프록시 — 응답 스트리밍만 하고 저장 없음
- 모든 AI 처리(isnet / BiRefNet-lite) 와 PDF 변환·편집은 WebGPU/WASM 클라이언트 사이드 실행

### 주의사항
- URL 붙여넣기 기능은 외부 이미지를 서버가 1회 fetch하므로, **현재 안내문은 "사용자가 직접 업로드한 파일"에 한정된 약속**. 향후 정식 개인정보처리방침 페이지를 만들 때 이 예외를 명시할 것
- AGENTS.md 와 CLAUDE.md 가 별도 파일로 분리되어 있음 — 글로벌 규칙상 심볼릭 링크로 통합 권장이나 본 작업 범위에서는 분리 유지 (다음 작업 시 개별 처리)

---

## 2026-05-14 — 접속 암호 제거 + 99PAGE 상단 GIF 배너 추가

### 에이전트
Codex

### 유형
feat (접근 흐름 개선) + design (상단 광고 배너)

### 영향 범위
- 초기 접속 비밀번호 게이트 제거 (`src/app.js`, `public/index.html`)
- 99PAGE sponsor GIF 배너 추가 (`public/assets/99page-banner.gif`, `public/assets/99page-banner-mobile.gif`)
- 로컬 정적 서버 GIF MIME 지원 (`build.js`)
- 문서 동기화 (`CLAUDE.md`, `docs/WORKLOG.md`)

### 내용
1. **암호 입력 절차 제거**
   - `ACCESS_PASSWORD`, `ACCESS_SESSION_KEY`, `setupAccessGate()` 및 관련 세션 저장 로직 삭제
   - `accessGate` 모달 마크업 삭제
   - 초기 로딩 후 바로 리소스 로딩과 이벤트 바인딩으로 진입

2. **99PAGE 상단 GIF 배너 추가**
   - `https://page-e.net/`으로 연결되는 sponsor 링크 추가 (`rel="noopener sponsored"`)
   - 데스크톱용 리더보드 GIF와 모바일 전용 GIF를 분리해 읽기성 유지
   - 헤더 아래 sticky 영역에 배치해 기능 사용 중에도 상단에서 자연스럽게 노출

3. **정적 파일 서빙 보강**
   - 개발 서버 MIME 테이블에 `.gif: image/gif` 추가

### 검증
- `pnpm build` 성공
- 로컬 브라우저 검증: 데스크톱/390px 모바일 첫 화면에서 암호 모달 미노출, 99PAGE 배너 노출 확인
- `curl -I /assets/99page-banner.gif`: `Content-Type: image/gif` 확인
- `pnpm test` 실행: 전체 테스트 중 기존 회귀 테스트 3건 실패
  - `tests/regression/comparisonPortraitLayout.test.js`
  - `tests/regression/i18nRuntime.test.js` 2건
  - 이번 변경 파일과 직접 관련 없는 기존 실패로 판단, 빌드와 화면 검증은 통과

### 주의사항
- 모바일 배너는 별도 GIF를 사용한다. 데스크톱 GIF만 교체하면 모바일 읽기성이 깨질 수 있다.
- 배너 링크는 외부 이동이므로 `target="_blank"`와 `rel="noopener sponsored"`를 유지한다.

---

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
