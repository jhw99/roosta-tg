#!/usr/bin/env python3
"""
Fallback screenshot renderer for the user-guide PNGs.

Generates 13 placeholder screenshots (1280x800) that approximate the
TMA's brand styling. Used when Playwright/Chromium is not available in
the build sandbox. The canonical capture script is
`scripts/capture-userguide.ts`; re-run that in a normal dev environment
to replace these with real screenshots.
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 800
BRAND = (255, 122, 41)      # Roosta orange
BRAND_DARK = (200, 78, 12)
BG = (250, 247, 242)
INK = (28, 24, 22)
MUTED = (110, 100, 92)
CARD = (255, 255, 255)
BORDER = (228, 220, 210)
WARN_BG = (255, 244, 219)
WARN_BORDER = (240, 180, 60)


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def font_bold(size: int) -> ImageFont.FreeTypeFont:
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return font(size)


def base(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # Header bar
    d.rectangle([(0, 0), (W, 72)], fill=CARD)
    d.line([(0, 72), (W, 72)], fill=BORDER)
    d.text((28, 22), "Roosta", font=font_bold(28), fill=BRAND)
    d.text((W - 220, 28), "TMA preview", font=font(16), fill=MUTED)
    # Title
    d.text((28, 96), title, font=font_bold(32), fill=INK)
    d.text((28, 140), subtitle, font=font(18), fill=MUTED)
    return img, d


def card(d: ImageDraw.ImageDraw, xy, *, radius=14, fill=CARD, border=BORDER):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=border, width=1)


def button(d: ImageDraw.ImageDraw, xy, text: str, *, primary=True):
    fill = BRAND if primary else CARD
    color = (255, 255, 255) if primary else INK
    d.rounded_rectangle(xy, radius=10, fill=fill, outline=BRAND_DARK if primary else BORDER, width=1)
    x = (xy[0] + xy[2]) // 2
    y = (xy[1] + xy[3]) // 2
    bbox = d.textbbox((0, 0), text, font=font_bold(16))
    d.text((x - (bbox[2] - bbox[0]) // 2, y - (bbox[3] - bbox[1]) // 2), text, font=font_bold(16), fill=color)


def save(img: Image.Image, name: str) -> None:
    img.save(OUT / name, "PNG", optimize=True)


# ---- Organizer screenshots ----

def organizer_1():
    img, d = base("내 계 (My Kyes)", "아직 만든 계가 없습니다.")
    card(d, (28, 200, W - 28, 520))
    d.text((W // 2 - 160, 320), "Empty — no kyes yet", font=font_bold(22), fill=MUTED)
    button(d, (W // 2 - 120, 380, W // 2 + 120, 430), "+ 새 계 만들기")
    save(img, "organizer-1.png")


def organizer_2():
    img, d = base("새 계 만들기", "기본 정보를 입력하세요.")
    card(d, (28, 200, W - 28, 720))
    labels = [("이름", "Friends 6"), ("설명", "Weekly kye, 6 members"), ("그룹 채팅 연동", "ON")]
    y = 230
    for k, v in labels:
        d.text((48, y), k, font=font_bold(16), fill=MUTED)
        d.rounded_rectangle((48, y + 28, W - 48, y + 76), radius=8, fill=BG, outline=BORDER, width=1)
        d.text((64, y + 44), v, font=font(18), fill=INK)
        y += 96
    button(d, (W - 220, 640, W - 48, 690), "다음")
    save(img, "organizer-2.png")


def organizer_3():
    img, d = base("파라미터 설정", "슬라이더로 페이아웃을 조정합니다.")
    card(d, (28, 200, 620, 720))
    sliders = [("계원 수 N", "6"), ("기여금 C", "20 USDT"),
               ("주기", "주 1회"), ("수수료율 F", "3.0%"),
               ("α_max", "8%"), ("디폴트 정책", "ProRata")]
    y = 220
    for k, v in sliders:
        d.text((48, y), k, font=font_bold(14), fill=MUTED)
        d.text((300, y), v, font=font_bold(16), fill=INK)
        d.rounded_rectangle((48, y + 22, 580, y + 28), radius=3, fill=BORDER)
        d.rounded_rectangle((48, y + 22, 200 + (hash(k) % 300), y + 28), radius=3, fill=BRAND)
        y += 50
    # Warning callout
    card(d, (640, 200, W - 28, 380), fill=WARN_BG, border=WARN_BORDER)
    d.text((660, 220), "경고", font=font_bold(20), fill=BRAND_DARK)
    d.text((660, 256), "1번 순서가 풀의 80% 미만입니다.", font=font(16), fill=INK)
    d.text((660, 284), "F + α_max = 11% — 안전 범위 내", font=font(14), fill=MUTED)
    # Payout table preview
    card(d, (640, 400, W - 28, 720))
    d.text((660, 416), "페이아웃 미리보기", font=font_bold(18), fill=INK)
    rows = [("k=1", "117.4"), ("k=2", "118.6"), ("k=3", "119.8"),
            ("k=4", "121.0"), ("k=5", "122.2"), ("k=6", "123.4")]
    for i, (k, v) in enumerate(rows):
        ry = 456 + i * 38
        d.text((680, ry), k, font=font(16), fill=MUTED)
        d.text((W - 120, ry), v + " USDT", font=font_bold(16), fill=INK)
    save(img, "organizer-3.png")


def organizer_4():
    img, d = base("페이아웃 미리보기", "순서별 받는 금액을 검토하세요.")
    card(d, (28, 200, W - 28, 720))
    headers = ["순서 k", "받는 시점", "페이아웃", "누적 납입", "순손익"]
    for i, h in enumerate(headers):
        d.text((60 + i * 240, 220), h, font=font_bold(15), fill=MUTED)
    rows = [
        ("1", "1주차", "117.4 USDT", "20 USDT",   "+97.4"),
        ("2", "2주차", "118.6 USDT", "40 USDT",   "+78.6"),
        ("3", "3주차", "119.8 USDT", "60 USDT",   "+59.8"),
        ("4", "4주차", "121.0 USDT", "80 USDT",   "+41.0"),
        ("5", "5주차", "122.2 USDT", "100 USDT",  "+22.2"),
        ("6", "6주차", "123.4 USDT", "120 USDT",  "+3.4"),
    ]
    for r, row in enumerate(rows):
        y = 264 + r * 60
        for i, val in enumerate(row):
            d.text((60 + i * 240, y), val, font=font(15), fill=INK)
    button(d, (W - 220, 660, W - 48, 710), "계 생성")
    save(img, "organizer-4.png")


def organizer_5():
    img, d = base("초대링크 생성됨!", "친구에게 공유하여 계원을 모집하세요.")
    card(d, (28, 200, W - 28, 520))
    d.text((48, 220), "Contract address", font=font_bold(14), fill=MUTED)
    d.text((48, 248), "EQDemoKyeAddressForGuideScreenshotsxxxxxxxxxxx", font=font(15), fill=INK)
    d.text((48, 310), "Invite link", font=font_bold(14), fill=MUTED)
    d.rounded_rectangle((48, 340, W - 48, 392), radius=8, fill=BG, outline=BORDER, width=1)
    d.text((64, 354), "https://t.me/RoostaBot?start=join_EQDemoKye...", font=font(15), fill=INK)
    button(d, (48, 440, 240, 490), "링크 복사")
    button(d, (260, 440, 460, 490), "텔레그램 공유", primary=False)
    save(img, "organizer-5.png")


def organizer_6():
    img, d = base("Friends 6 — 진행 중", "라운드 3 / 6 · 다음 인출까지 2일 14시간")
    card(d, (28, 200, 620, 720))
    d.text((48, 220), "멤버 (6명)", font=font_bold(18), fill=INK)
    members = [("1. @alice",   "✓ paid"),
               ("2. @bob",     "✓ paid"),
               ("3. @carol",   "• pending"),
               ("4. @dave",    "✓ paid"),
               ("5. @eve",     "✓ paid"),
               ("6. @frank",   "✓ paid")]
    for i, (m, s) in enumerate(members):
        y = 260 + i * 60
        d.text((60, y), m, font=font(16), fill=INK)
        d.text((460, y), s, font=font_bold(14), fill=BRAND if "pending" in s else (60, 160, 80))
    card(d, (640, 200, W - 28, 460))
    d.text((660, 220), "현재 라운드", font=font_bold(18), fill=INK)
    d.text((660, 256), "라운드 3 — winner: @carol", font=font(16), fill=MUTED)
    d.text((660, 286), "예상 페이아웃: 119.8 USDT", font=font(16), fill=INK)
    d.text((660, 320), "실행: 2026-05-15 09:00 UTC", font=font(14), fill=MUTED)
    card(d, (640, 480, W - 28, 720))
    d.text((660, 500), "누적 수수료 수입", font=font_bold(14), fill=MUTED)
    d.text((660, 524), "7.2 USDT", font=font_bold(28), fill=BRAND)
    save(img, "organizer-6.png")


def organizer_7():
    img, d = base("내 계 (3)", "운영 중인 계 목록")
    items = [("Friends 6",   "활성 · 라운드 3/6", "다음: 2일 후"),
             ("Family Save", "활성 · 라운드 1/10", "다음: 5일 후"),
             ("Coworkers",   "완료 · 12/12",      "2026-04 완주")]
    for i, (name, status, nxt) in enumerate(items):
        y = 200 + i * 140
        card(d, (28, y, W - 28, y + 120))
        d.text((48, y + 20), name, font=font_bold(22), fill=INK)
        d.text((48, y + 60), status, font=font(16), fill=MUTED)
        d.text((48, y + 86), nxt, font=font(14), fill=BRAND)
        button(d, (W - 220, y + 36, W - 48, y + 88), "열기")
    save(img, "organizer-7.png")


# ---- Member screenshots ----

def member_1():
    img, d = base("계 가입 — Friends 6", "계 정보를 확인하세요.")
    card(d, (28, 200, W - 28, 540))
    info = [("주최자", "@jhenry"),
            ("멤버", "5 / 6"),
            ("기여금", "20 USDT × 6 회"),
            ("주기", "주 1회 · 6주"),
            ("수수료", "3.0% (계주 2.5% + 플랫폼 0.5%)"),
            ("디폴트 정책", "ProRata (비례 축소)")]
    for i, (k, v) in enumerate(info):
        y = 230 + i * 48
        d.text((48, y), k, font=font_bold(16), fill=MUTED)
        d.text((300, y), v, font=font(16), fill=INK)
    button(d, (W // 2 - 120, 580, W // 2 + 120, 630), "내 슬롯 선택")
    save(img, "member-1.png")


def member_2():
    img, d = base("순서 선택", "내 차례를 고르세요. 빠른 순서는 무이자 대출, 늦은 순서는 적금형.")
    slots = [(1, "117.4", "+97.4", True),
             (2, "118.6", "+78.6", True),
             (3, "119.8", "+59.8", False),
             (4, "121.0", "+41.0", False),
             (5, "122.2", "+22.2", True),
             (6, "123.4", "+3.4",  True)]
    for i, (k, payout, pnl, available) in enumerate(slots):
        col = i % 3
        row = i // 3
        x0 = 28 + col * 420
        y0 = 200 + row * 220
        card(d, (x0, y0, x0 + 400, y0 + 200),
             fill=CARD if available else (245, 240, 235),
             border=BRAND if k == 3 else BORDER)
        d.text((x0 + 20, y0 + 16), f"순서 {k}", font=font_bold(18), fill=INK)
        d.text((x0 + 20, y0 + 48), f"페이아웃 {payout} USDT", font=font(15), fill=INK)
        d.text((x0 + 20, y0 + 78), f"순손익 {pnl} USDT", font=font_bold(15), fill=BRAND if k <= 2 else (60, 160, 80))
        if not available:
            d.text((x0 + 20, y0 + 140), "선점됨", font=font_bold(14), fill=MUTED)
        elif k == 1:
            d.text((x0 + 20, y0 + 140), "⚠ 무이자 대출형 — 끝까지 책임", font=font(13), fill=BRAND_DARK)
    save(img, "member-2.png")


def member_3():
    img, d = base("동의 및 확인", "경고 메시지를 읽고 동의하세요.")
    card(d, (28, 200, W - 28, 560), fill=WARN_BG, border=WARN_BORDER)
    warns = ["• 1번 순서가 풀의 80% 미만입니다 (F + α_max = 11%).",
             "• 자동 인출 권한이 부여됩니다 — 매 라운드 20 USDT 이하만, 본 계 컨트랙트에만 인출됩니다.",
             "• 중도 이탈 시 디폴트 정책(ProRata)이 적용됩니다.",
             "• 라운드 24시간 전 충전 알림이 DM으로 발송됩니다."]
    for i, w in enumerate(warns):
        d.text((48, 232 + i * 50), w, font=font(16), fill=INK)
    # Checkbox
    d.rounded_rectangle((48, 600, 78, 630), radius=4, fill=BRAND, outline=BRAND_DARK)
    d.text((58, 605), "✓", font=font_bold(20), fill=(255, 255, 255))
    d.text((96, 604), "위 내용을 모두 이해했으며 가입에 동의합니다.", font=font_bold(16), fill=INK)
    button(d, (W // 2 - 140, 670, W // 2 + 140, 720), "가입 + 지갑 연결")
    save(img, "member-3.png")


def member_4():
    img, d = base("Friends 6 — 진행 중", "다음 인출까지 1일 03시간 22분")
    card(d, (28, 200, W - 28, 440), fill=BRAND, border=BRAND_DARK)
    d.text((48, 224), "다음 인출", font=font_bold(18), fill=(255, 240, 220))
    d.text((48, 260), "1d 03:22:14", font=font_bold(54), fill=(255, 255, 255))
    d.text((48, 332), "20 USDT가 자동 인출됩니다. 잔액을 확인하세요.", font=font(16), fill=(255, 245, 230))
    button(d, (W - 240, 360, W - 48, 412), "잔액 충전하기")
    card(d, (28, 460, W - 28, 720))
    d.text((48, 480), "내 차례", font=font_bold(16), fill=MUTED)
    d.text((48, 508), "순서 3 — 3주차에 119.8 USDT 수령", font=font_bold(20), fill=INK)
    d.text((48, 552), "현재 잔액", font=font_bold(16), fill=MUTED)
    d.text((48, 580), "127.50 USDT  ✓ 충분", font=font_bold(20), fill=(60, 160, 80))
    save(img, "member-4.png")


def member_5():
    img, d = base("라운드 기록", "Friends 6 — 과거 라운드")
    rounds = [("R1", "2026-04-24", "@alice",  "117.4 USDT", "0xab12...ef34"),
              ("R2", "2026-05-01", "@bob",    "118.6 USDT", "0xcd56...ab78"),
              ("R3", "2026-05-08", "@carol",  "119.8 USDT", "pending")]
    for i, (r, dt, w, p, tx) in enumerate(rounds):
        y = 200 + i * 130
        card(d, (28, y, W - 28, y + 110))
        d.text((48, y + 18), r, font=font_bold(22), fill=BRAND)
        d.text((110, y + 22), dt, font=font(16), fill=MUTED)
        d.text((300, y + 22), f"당첨자 {w}", font=font_bold(16), fill=INK)
        d.text((300, y + 56), f"페이아웃 {p}", font=font(15), fill=INK)
        d.text((W - 380, y + 22), "tx:", font=font(14), fill=MUTED)
        d.text((W - 350, y + 22), tx, font=font(14), fill=BRAND_DARK)
        d.text((W - 380, y + 56), "[Tonscan에서 보기]", font=font(13), fill=BRAND)
    save(img, "member-5.png")


def member_6():
    img, d = base("지갑", "TON Connect로 연결됨")
    card(d, (28, 200, W - 28, 440))
    d.text((48, 220), "연결된 지갑", font=font_bold(14), fill=MUTED)
    d.text((48, 246), "Tonkeeper", font=font_bold(22), fill=INK)
    d.text((48, 286), "EQDemoUserWalletAddressForGuide...xxxxxxxxx", font=font(15), fill=MUTED)
    d.text((48, 326), "USDT 잔액", font=font_bold(14), fill=MUTED)
    d.text((48, 354), "127.50", font=font_bold(36), fill=BRAND)
    d.text((180, 368), "USDT", font=font_bold(18), fill=MUTED)
    button(d, (W - 240, 360, W - 48, 410), "충전하기")
    card(d, (28, 460, W - 28, 720))
    d.text((48, 480), "활성 자동 인출 권한", font=font_bold(18), fill=INK)
    d.text((48, 514), "• Friends 6 — 20 USDT × 4 회 남음", font=font(16), fill=MUTED)
    d.text((48, 544), "• 컨트랙트: EQDemoKyeAddress...", font=font(14), fill=MUTED)
    d.text((48, 580), "다른 컨트랙트는 인출할 수 없습니다.", font=font(14), fill=(60, 160, 80))
    save(img, "member-6.png")


def main():
    organizer_1(); organizer_2(); organizer_3(); organizer_4()
    organizer_5(); organizer_6(); organizer_7()
    member_1(); member_2(); member_3()
    member_4(); member_5(); member_6()
    files = sorted(p.name for p in OUT.glob("*.png"))
    print(f"Wrote {len(files)} files to {OUT}")
    for f in files:
        print(f"  - {f}")


if __name__ == "__main__":
    main()
