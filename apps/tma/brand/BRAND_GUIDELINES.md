# Roosta Brand Guidelines

로고와 브랜드 자산을 일관되게 사용하기 위한 가이드.
MVP 단계라 짧고 실용적으로 정리했습니다.

---

## ✅ DO

### 로고 사용
- **충분한 여백**: 로고 주변에 최소 로고 높이의 1/4 만큼 여백 확보
- **컨트라스트 확인**: 라이트 배경엔 light 버전, 다크 배경엔 dark 버전
- **벡터 우선**: 가능하면 SVG 사용. 래스터 PNG는 픽셀 단위 크기가 정해진 곳에만
- **파비콘**: `favicons/` 세트 통째로 `/public`에 복사

### 컬러 사용
- **Primary는 강조용**: 메인 CTA, 링크, 로고에만 사용. 페이지 전체를 오렌지로 도배 X
- **상태 컬러는 의미 있게**:
  - `success` (#22C55E) → Round Settled (회차 완료)
  - `warning` (#F59E0B) → Round Delayed (미납자 있음)
  - `error` (#EF4444) → 트랜잭션 실패
- **다크 모드**: ring color를 Warm Yellow (#F4A261)로 시프트해서 가독성 확보

### 타이포그래피
- **헤드라인**: Fraunces (display 폰트)
- **본문**: Inter (body 폰트)
- **코드/트랜잭션 hash**: JetBrains Mono
- **폰트 weight 절제**: 100, 400, 500, 600, 700 정도만. 9가지 다 쓰지 X

---

## ❌ DON'T

### 로고
- ❌ **로고를 늘리거나 찌그러뜨리지 마세요** — 항상 비율 유지 (aspect-ratio 고정)
- ❌ **로고 색상을 임의로 바꾸지 마세요** — 단색 버전이 필요하면 추가 요청
- ❌ **로고 위에 텍스트를 겹치게 두지 마세요** — 별도 영역으로 분리
- ❌ **저해상도 PNG를 큰 사이즈로 키우지 마세요** — SVG 또는 더 큰 PNG 사용
- ❌ **로고 안의 빨간 점(현재 회차 수령자)을 다른 색으로 바꾸지 마세요** — 의미가 있는 요소

### 컬러
- ❌ **Primary와 비슷한 다른 오렌지 추가 X** — 색상 노이즈 생김
- ❌ **Tailwind 기본 orange-500 (#F97316) 같은 비슷한 색 혼용 X** — `roosta-500`만 사용
- ❌ **다크 모드에서 라이트 배경 컬러 그대로 쓰지 마세요** — bg-dark, surface-dark 사용

### 타이포그래피
- ❌ **Fraunces를 본문에 사용 X** — 가독성 떨어짐
- ❌ **Comic Sans, Papyrus 같은 폰트 X** — 당연하지만
- ❌ **시스템 폰트 (Arial, Helvetica)만 단독 사용 X** — Roosta 캐릭터 사라짐

---

## 📐 사이즈 가이드라인

### 로고

| 사용처 | 권장 사이즈 | 파일 |
|---|---|---|
| Favicon (브라우저 탭) | 16, 32 | `favicon.ico` |
| iOS 홈 화면 | 180×180 | `apple-touch-icon.png` |
| Android 홈 화면 / PWA | 192, 512 | `android-chrome-*.png` |
| 헤더 (가로형) | 높이 32~48px | `roosta-lockup.svg` |
| 푸터 (가로형) | 높이 24~32px | `roosta-lockup.svg` |
| 모바일 헤더 (아이콘만) | 32~40px | `roosta-icon.svg` |
| 랜딩 hero | 높이 80~120px | `roosta-stacked.svg` |
| 소셜 공유 (OG image) | 1200×630 | `roosta_og_image_1200x630.png` |
| 명함 / 프린트 | SVG (벡터) | `svg/` 폴더 |

### 컴포넌트

| 컴포넌트 | 권장 padding | 권장 radius |
|---|---|---|
| Button (primary) | px-4 py-2 (sm), px-6 py-3 (md) | rounded-roosta-md |
| Card | p-6 | rounded-roosta-lg |
| Input | px-3 py-2 | rounded-roosta-sm |
| Modal/Dialog | p-8 | rounded-roosta-lg |

---

## 🎯 컴포넌트 톤 예시

### 좋은 예시 — Roosta다움
- **Card**: 부드러운 그림자, 따뜻한 오프화이트 배경, 미세한 border (rgba black/white 8~10%)
- **Button (primary)**: 메인 오렌지 (#E85D2F), hover 시 deep red (#C73E1D)로 transition
- **상태 뱃지**:
  - "Settled" → 그린 배경 + 진한 그린 텍스트
  - "Delayed" → 옅은 오렌지 배경 + Roosta deep red 텍스트 (브랜드 컬러 활용)

### 피해야 할 예시 — AI Slop
- ❌ Purple gradient on white (Web3 generic)
- ❌ Glassmorphism 과다 (모든 카드가 backdrop-blur)
- ❌ Inter + system gray만 사용 (캐릭터 없음)
- ❌ 회색 톤 일색 (Roosta의 따뜻한 오렌지 정체성 사라짐)

---

## 🌐 OG 이미지 가이드

소셜 공유 (Twitter, Telegram, Discord)에 노출되는 미리보기 이미지.

- 사이즈: 1200×630 (Twitter), 1200×627 (Facebook)
- 본 패키지의 `roosta_og_image_1200x630.png` 사용
- 다른 페이지마다 OG 이미지를 다르게 하고 싶으면 동일 비율 유지하고 텍스트 오버레이 추가

---

## 📋 사용 시 자주 물어보는 것

**Q. 로고를 다른 색으로 쓰고 싶어요 (예: 검정 단색)**
A. MVP 단계에서는 권장하지 않습니다. 닭 볏의 컬러 그라데이션이 브랜드 정체성의 핵심입니다.

**Q. 닭 볏 모티프만 따로 사용해도 되나요?**
A. 네, 구분선이나 빈 상태 일러스트에 활용하시면 좋습니다. 단, 별도 로고로 사용하지 마세요.

**Q. 다크 모드에서 ring color는 왜 바뀌나요?**
A. Deep red (#C73E1D)는 dark bg (#1A1A1A) 위에서 가독성이 떨어집니다. Warm yellow (#F4A261)로 시프트해서 더 잘 보이게 합니다.

**Q. shadcn/ui와 충돌이 나면?**
A. shadcn 기본 컬러는 HSL로 정의되어 있습니다. README의 shadcn 통합 섹션의 HSL 변환 값을 사용하세요.

**Q. 모바일에서 favicon이 안 나와요**
A. iOS는 `apple-touch-icon.png` (180×180) 필요, Android는 `android-chrome-192x192.png` 필요. 둘 다 `/public`에 있어야 합니다.

---

## 🔗 다음 단계

브랜드가 더 성장하면 추가될 것:

- 모션 가이드 (애니메이션 timing, easing)
- 음성 톤 가이드 (UX 카피 가이드라인)
- 일러스트레이션 시스템
- 프로덕트 스크린샷 템플릿
- 풀 컬러 팔레트 확장 (현재는 오렌지 단일축)

MVP 단계에서는 위 가이드만으로 충분합니다.
