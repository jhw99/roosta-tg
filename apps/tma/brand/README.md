# Roosta CI Package

Roosta 브랜드 자산 + 디자인 토큰 + Next.js 통합 가이드.
**Claude Code가 그대로 받아서 적용 가능한 형태로 정리**했습니다.

---

## 📁 폴더 구조

```
roosta_ci/
├── README.md                    # 이 문서
├── BRAND_GUIDELINES.md          # 사용 가이드 (do / don't)
│
├── svg/                         # 벡터 원본 (무한 확대 가능)
│   ├── roosta-icon.svg          # 아이콘만 (라이트 모드)
│   ├── roosta-icon-dark.svg     # 아이콘만 (다크 모드)
│   ├── roosta-lockup.svg        # 가로형 (아이콘 + Roosta 텍스트)
│   ├── roosta-lockup-dark.svg
│   ├── roosta-stacked.svg       # 세로형 (아이콘 위, 텍스트 아래)
│   └── roosta-stacked-dark.svg
│
├── favicons/                    # 웹 favicon 전체 세트
│   ├── favicon.ico              # 멀티 사이즈 ICO (16/32/48)
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon-48x48.png
│   ├── favicon-64x64.png
│   ├── favicon-128x128.png
│   ├── apple-touch-icon.png     # iOS 홈 화면 (180x180)
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png  # PWA
│   ├── icon-192-transparent.png
│   ├── icon-512-transparent.png
│   └── site.webmanifest         # PWA manifest
│
├── logos/                       # 고해상도 PNG (소셜, 프레젠테이션 등)
│   ├── roosta_icon_*.png        # light / dark / transparent
│   ├── roosta_lockup_*.png      # 가로형
│   ├── roosta_stacked_*.png     # 세로형
│   └── roosta_og_image_1200x630.png  # 소셜 공유 미리보기
│
└── tokens/                      # 디자인 토큰 (개발에 직접 사용)
    ├── roosta-tokens.css        # CSS 변수 (모든 환경에서 작동)
    ├── roosta-theme.css         # Tailwind v4 @theme 디렉티브
    ├── tailwind.config.ts       # Tailwind v3 config
    ├── brand.ts                 # TypeScript 상수
    └── layout.example.tsx       # Next.js layout.tsx 예시
```

---

## 🚀 빠른 시작

### 1단계: 파일을 프로젝트에 복사

```bash
# 프로젝트 루트가 ./roosta 라고 가정

# 1. Favicon 파일들 → public 폴더
cp roosta_ci/favicons/* ./roosta/app/public/

# 2. OG 이미지 → public 폴더 (이름 변경)
cp roosta_ci/logos/roosta_og_image_1200x630.png ./roosta/app/public/og-image.png

# 3. 로고 SVG → 컴포넌트 또는 public
cp roosta_ci/svg/roosta-icon.svg ./roosta/app/public/
cp roosta_ci/svg/roosta-lockup.svg ./roosta/app/public/

# 4. 디자인 토큰 → 프로젝트 통합 (아래 2단계 참조)
```

### 2단계: 디자인 토큰 통합

본인 Tailwind 버전에 맞춰 하나만 선택:

#### Option A: Tailwind v4 (권장, 최신)

```css
/* app/globals.css */

@import "tailwindcss";

/* Roosta 테마 토큰 */
@theme {
  --color-roosta-50:  #FFF7F2;
  --color-roosta-100: #FFEAD9;
  --color-roosta-200: #FCD0AB;
  --color-roosta-300: #F4A261;
  --color-roosta-400: #ED7E47;
  --color-roosta-500: #E85D2F;
  --color-roosta-600: #D74E22;
  --color-roosta-700: #C73E1D;
  --color-roosta-800: #A03217;
  --color-roosta-900: #6E2310;

  --color-bg-light: #FAFAF7;
  --color-bg-dark:  #1A1A1A;

  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', -apple-system, sans-serif;
}
```

또는 그냥 `roosta_ci/tokens/roosta-theme.css` 파일을 import:

```css
@import "tailwindcss";
@import "./roosta-theme.css";
```

#### Option B: Tailwind v3

`roosta_ci/tokens/tailwind.config.ts`의 `theme.extend` 부분을 본인 `tailwind.config.ts`에 병합.

#### Option C: 순수 CSS (Tailwind 안 쓰는 경우)

`roosta_ci/tokens/roosta-tokens.css`를 globals.css 위에 import.

```css
@import "./roosta-tokens.css";
```

### 3단계: TypeScript 상수 추가

```bash
cp roosta_ci/tokens/brand.ts ./roosta/app/lib/brand.ts
```

사용 예시:

```tsx
import { ROOSTA_COLORS, ROOSTA_BRAND } from "@/lib/brand";

<h1>{ROOSTA_BRAND.name}</h1>
<div style={{ background: ROOSTA_COLORS.orangeMain }}>...</div>
```

### 4단계: layout.tsx 메타데이터 적용

`roosta_ci/tokens/layout.example.tsx` 파일의 `metadata` 객체를 본인 `app/layout.tsx`에 복사.

이 한 번으로 favicon, OG 이미지, Twitter 카드, 테마 컬러까지 모두 적용됩니다.

---

## 🎨 컬러 팔레트 요약

| 이름 | HEX | 용도 |
|---|---|---|
| `roosta-500` (Main) | `#E85D2F` | 주요 버튼, 링크, 브랜드 |
| `roosta-700` (Deep) | `#C73E1D` | 강조, 호버 (light), 텍스트 강조 |
| `roosta-300` (Warm) | `#F4A261` | 보조 강조, 다크 모드 ring |
| `bg-light` | `#FAFAF7` | 라이트 모드 배경 |
| `bg-dark` | `#1A1A1A` | 다크 모드 배경 |

전체 50~900 스케일은 `tokens/brand.ts` 또는 `tokens/tailwind.config.ts` 참조.

---

## 🔤 폰트

- **Display (헤드라인)**: Fraunces (Google Fonts) — 따뜻하고 distinctive한 serif
- **Body (본문)**: Inter (Google Fonts) — 깔끔한 sans-serif
- **Monospace (코드, 트랜잭션 hash)**: JetBrains Mono

Next.js에서 폰트 로딩:

```tsx
// app/layout.tsx
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
```

---

## 🧩 shadcn/ui 통합

shadcn/ui 사용 시, `components.json`의 컬러 매핑을 Roosta primary로 덮어씁니다.

```bash
# shadcn 초기 설정 시
npx shadcn@latest init
```

설정 단계에서:
- **Style**: Default
- **Base color**: Stone (Roosta 톤과 가장 잘 어울림)
- **CSS variables**: Yes

이후 `globals.css`에서 shadcn 변수를 Roosta 컬러로 오버라이드:

```css
:root {
  --primary: 13 86% 55%;        /* #E85D2F in HSL */
  --primary-foreground: 0 0% 98%;
  --secondary: 24 84% 67%;       /* #F4A261 in HSL */
  --secondary-foreground: 0 0% 10%;
  --background: 60 20% 98%;     /* #FAFAF7 */
  --foreground: 0 0% 10%;
}

.dark {
  --primary: 13 86% 55%;
  --background: 0 0% 10%;       /* #1A1A1A */
  --foreground: 60 20% 98%;
}
```

---

## ✅ 검증 체크리스트

배포 전 확인:

- [ ] `/public/favicon.ico` 접근 가능
- [ ] 브라우저 탭에 Roosta 로고 표시
- [ ] iOS Safari에서 "홈 화면에 추가" 시 apple-touch-icon 표시
- [ ] Twitter/X 링크 공유 시 OG 이미지 미리보기 정상 (use [Twitter Card Validator](https://cards-dev.twitter.com/validator))
- [ ] 라이트/다크 모드에서 로고 가독성 OK
- [ ] PWA 설치 시 manifest 정상 (Chrome DevTools → Application → Manifest)
- [ ] 모바일 (Chrome 안드로이드)에서 테마 컬러 적용

---

## 📦 추가 자산이 필요할 때

이 패키지에 포함되지 않은 자산이 필요하면:

- **App store 아이콘 (1024x1024 rounded)**: `logos/roosta_icon_light_1024.png`을 마스킹
- **Splash screen**: `logos/roosta_stacked_light_1024.png` 사용
- **Email signature**: `logos/roosta_lockup_light_1200.png` (이메일 width 100~150px로 조정)
- **Print (명함, 포스터)**: SVG 원본 (`svg/`) 사용해서 무한 확대

---

## 🔗 참고

- 로고 디자인: 닭 볏 (rooster comb) + ROSCA의 회전 모티프 결합
- 컬러 영감: 닭 볏의 따뜻한 오렌지-레드 + 전통 ROSCA의 community warmth
- 폰트 선택 이유: Fraunces는 character가 있는 serif로 fintech 클리셰(Inter+purple gradient)와 차별화
