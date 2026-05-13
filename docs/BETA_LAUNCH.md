# Beta Launch Plan

Story 7.5. End-to-end plan for taking Roosta from internal testing to first 10 real beta users.

---

## 1. Pre-Launch Testing Matrix

All 7 TMA pages exercised across language, theme, and form factor. Total cells: 7 × 2 × 2 × 2 = 56.

| Page | ko | en | dark | light | mobile | desktop |
|---|---|---|---|---|---|---|
| Home | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Create Kye | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Join Kye | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Kye Detail | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Round History | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Wallet | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Settings | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Each cell verified for: layout (no clipped text), copy (no missing i18n keys), color contrast (WCAG AA), MainButton/BackButton behavior. Run on iPhone 14, Pixel 7, Galaxy S22, and desktop Telegram (macOS, Windows).

Plus the backend + bot smoke flow: 2-member test kye runs end-to-end on testnet with all notifications received.

## 2. First 10 Beta User Recruitment

**Target profile:** Korean-speaking, crypto-comfortable (has a TON wallet or willing to install Tonkeeper), already part of a real-world 계 or interested in trying one. Age 25–45.

**Where to find:**
- Founder's personal network (5 slots reserved).
- TON Korea Telegram group `@tonkorea` — post a single intro message asking for 3 testers.
- 디스콰이엇 (disquiet.io) — soft post in #web3 channel for 2 testers.

**Recruitment script (Korean):**

> 안녕하세요. 텔레그램 미니앱으로 친구들과 계(ROSCA)를 할 수 있는 Roosta를 만들고 있는데, 첫 10명의 베타 테스터를 찾고 있습니다. 6주간 진행되는 작은 계(주 10 USDT × 6명)에 참여하시면 됩니다. 발견하신 이슈는 직접 제보 부탁드리고, 완주 후 짧은 인터뷰(30분) 한 번만 부탁드립니다. 관심 있으시면 DM 주세요.

Onboarding session: 30-minute call per tester, screen-share through TON Connect, wallet funded with test USDT by founder.

## 3. Support Channel

Create `@RoostaSupportBot` (separate from main `@RoostaBot`) with these forwarders:
- All DMs forwarded to founder's Telegram for the first 60 days.
- Auto-reply pointing to FAQ for common keywords (수수료, 환불, 미납, 가입).

Pinned post in `@RoostaOfficial` channel:
- Link to FAQ.
- Link to support bot.
- Status page (UptimeRobot public link).
- Latest deploy hash.

## 4. Feedback Form (Google Forms)

Copy-paste-ready questions:

1. **(필수)** 텔레그램 핸들: `@_______`
2. **(필수)** 어떤 순서로 가입하셨나요? (1번 / 중간 / 마지막)
3. 미니앱 첫 인상은 어땠나요? (1~5점)
4. 계 조건 화면(페이아웃 표, 경고)이 이해되었나요? (1~5점)
5. 가입 과정에서 가장 헷갈렸던 부분은? (자유 응답)
6. TON Connect 지갑 연결 과정은 매끄러웠나요? (1~5점)
7. 봇 알림은 적절했나요? (너무 많음 / 적절 / 너무 적음)
8. 라운드 24시간 전 알림이 도움이 되었나요? (예 / 아니오)
9. 실제 페이아웃 받은 시점의 감정은? (자유 응답)
10. 다시 계에 가입한다면 어떤 조건을 바꾸시겠어요?
11. 친구에게 추천하시겠어요? (0~10 NPS)
12. (해당 시) 미납을 경험하셨다면, 처리 과정은 만족스러웠나요?
13. 다른 ROSCA 앱과 비교한다면 Roosta의 강점/약점은?
14. 자유 의견 / 버그 제보:

Send the form within 24 hours of kye completion, again at D7 and D30 for retention signal.

## 5. Hotfix Response Plan

**On-call:** founder (24/7 during beta, alarm via PagerDuty free tier on `support@roosta.app` mailbox).

**Severity tiers:**

| Tier | Definition | Response | Comm |
|---|---|---|---|
| **P0** | Funds at risk / contract bug / Bot down >15min | Immediate. Pause factory. Notify all users in 30 min. Public post-mortem in 72h. | Telegram channel + DM to every active user + email to multisig signers. |
| **P1** | Feature broken but funds safe (e.g., notifications failing for some users) | Within 4 hours. Feature flag off. | Telegram channel post within 2 hours. |
| **P2** | UX bug, typo, minor layout issue | Within 48 hours, batched into next release. | Changelog only. |

**P0 communication template:**

> [긴급] Roosta 운영 공지 — YYYY-MM-DD HH:MM
> 
> 다음 문제를 확인했습니다: [한 줄 요약].
> 영향 범위: [어떤 계, 어떤 사용자].
> 자금 상태: [안전 / 위험에 처함 — 즉시 emergencyCancel 권장].
> 현재 조치: [신규 계 생성 일시 중지 / 인덱서 롤백 / ...].
> 다음 업데이트: 1시간 이내.
> 문의: @RoostaSupportBot

## 6. Success Metrics

Measured weekly, dashboarded in Supabase + Metabase.

| Metric | Target (Beta) | Target (V1) | Source |
|---|---|---|---|
| **D7 retention** | ≥ 70% | ≥ 60% | `users.last_active_at` |
| **Kye completion rate** | ≥ 80% (small N) | ≥ 70% | `kyes.status='Completed' / total` |
| **Default rate per kye** | ≤ 5% of rounds | ≤ 3% | `events.event_type='DefaultDetected' / rounds` |
| **Organizer NPS** | ≥ 30 | ≥ 50 | Survey question 11 |
| **Avg circle size** | 5 members | 8 members | `AVG(memberCount)` |
| **Notification delivery rate** | ≥ 99% | ≥ 99.5% | `notifications.status='sent'` |
| **Round execution skew** | < 5 min | < 5 min | `executed_at - scheduled_at` |

**Gate to V1 GA:** beta success metrics all green for 4 consecutive weeks AND no open P0/P1 issues.

## 7. Beta Timeline

| Week | Milestone |
|---|---|
| 0 | Smoke test complete; recruitment messages posted; support bot live. |
| 1 | First 10 testers onboarded; first kye created. |
| 2 | First round executed; first feedback form sent. |
| 3-6 | Rounds run weekly; weekly retro with team; hotfix backlog burned down. |
| 7 | First kye completes; exit interviews; decide on V1 GA gate. |
