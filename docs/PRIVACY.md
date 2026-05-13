# Privacy Policy

Roosta ("the platform") processes personal data in accordance with the GDPR (EU) and the Personal Information Protection Act (Republic of Korea).

> **Legal review placeholder.** A licensed Korean attorney will review this document before public launch. The wording below may change.

---

## 1. What we collect

| Field | Required? | Collected when | Purpose |
|---|---|---|---|
| `telegram_id` | Required | Bot `/start` | User identification, notification delivery |
| `language` | Auto (required) | Extracted from Telegram init data | Interface language (ko / en) |
| `wallet_address` (TON) | Optional | On TON Connect | Join transactions, receiving payouts |
| Notification preferences | Optional | Settings page | Round reminders, group announcements |
| Join/round event metadata | Auto | On-chain event firing | Mini App display, notification generation |

We do **not** collect real names, government IDs, phone numbers, email addresses, payment cards, or bank accounts.

## 2. Purpose

- Telegram bot notifications and Mini App UI.
- Round scheduling and auto-withdraw execution.
- Security incident response and abuse prevention.
- Cooperation with lawful requests, where applicable.

## 3. Retention

- `telegram_id`, `wallet_address`, notification settings: kept until the user requests deletion, or 3 years after last activity, whichever is sooner.
- Event metadata (`events`, `rounds`): retained indefinitely as a cache of on-chain data (which itself is permanent).
- Notification delivery logs (`notifications`): purged after 90 days.

## 4. Processors

The platform shares data with the following processors:

| Processor | Purpose | Region |
|---|---|---|
| Supabase (Postgres) | DB storage | EU / US |
| Vercel | Mini App hosting | Global CDN |
| Railway | Bot and backend hosting | US |
| Telegram | Bot message delivery | Telegram infrastructure |
| Sentry | Error logging (PII masked) | EU |

We do **not** sell or share user data with advertisers, data brokers, or external marketing parties.

## 5. User rights

Users have the following rights:

- **Access:** request a copy of your data (via `@RoostaSupportBot`).
- **Rectification:** correct inaccurate data.
- **Deletion:** delete your account. If an on-chain circle is still in progress, `telegram_id` and `wallet_address` may be retained until the circle completes or is cancelled — these are required for auto-withdraw and payouts.
- **Portability:** export your data as JSON.
- **Objection:** opt out of notifications in the Settings page; objecting to all data collection means discontinuing the service.

Send requests to `@RoostaSupportBot` or `privacy@roosta.app`. We respond within 30 days.

## 6. On-chain data limitation

Wallet addresses, transactions, and join/payout records are permanently recorded on the TON blockchain. Even if we delete the corresponding rows from our database, the on-chain copy cannot be removed. This is a technical limit on the right to erasure, and users should understand this before joining.

## 7. Security

- All transport encrypted with TLS 1.3 or better.
- Per-user data isolation via Supabase Row Level Security.
- All secrets (`SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN`, etc.) live in environment variables only.
- Quarterly security review and secret rotation.

## 8. Minors

We do not allow users under 14. If we discover a user is under 14, their data is deleted immediately. Users between 14 and 18 require legal-guardian consent.

## 9. Amendments

Material changes to this policy are announced in the Mini App and via the bot, with 30 days' notice.

---

## Appendix: Korean Summary (한국어 요약)

비공식 요약. 영문 본문이 정본입니다.

- **수집 항목:** `telegram_id` (필수), 언어 (자동), `wallet_address` (선택), 알림 설정. 실명, 휴대전화, 이메일, 결제 카드는 수집하지 않습니다.
- **목적:** 알림 전송, 라운드 스케줄링, 어뷰징 차단.
- **보관 기간:** 계정 삭제 또는 마지막 활동 후 3년. 알림 로그는 90일.
- **처리자:** Supabase (DB), Vercel (TMA), Railway (Bot/Backend), Telegram (메시지), Sentry (에러).
- **권리 (GDPR / 개인정보보호법):** 열람, 정정, 삭제, 이전, 처리 거부. `privacy@roosta.app` 또는 `@RoostaSupportBot`, 30일 이내 응답.
- **온체인 데이터:** TON 블록체인 기록은 삭제 불가. 잊혀질 권리의 기술적 한계.
- **보안:** TLS 1.3, RLS, 환경변수 시크릿, 분기별 로테이션.
- **미성년자:** 만 14세 미만 불가, 만 19세 미만 보호자 동의 필요.
