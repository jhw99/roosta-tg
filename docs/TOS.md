# Roosta Terms of Service

These terms govern use of the ROSCA infrastructure service Roosta ("the platform") provides via Telegram bot and Mini App. By signing up, you agree to these terms.

> **Legal review placeholder.** This is a draft. A licensed Korean attorney will review and the final published version before launch. The wording in force at launch may differ from this document.

---

## 1. Roles

Roosta is a non-custodial infrastructure service involving three parties:

- **Roosta (Platform):** provides the smart contracts, Telegram bot, Mini App, and notification scheduler. The platform never holds user funds — all money moves through TON smart contracts.
- **Organizer:** creates the circle, recruits and vets members, and handles first-line disputes. Receives a portion of the round fee (`F − 0.5%`) as compensation.
- **Member:** reviews the circle's terms and decides whether to join. Members are responsible for reading all warnings and the payout table before joining.

## 2. Non-custodial principle

- The platform cannot hold, freeze, or seize any user's crypto-assets under any circumstance.
- All fund movement is determined by the smart contract code.
- The only platform-operated wallets are (i) the scheduler's gas wallet and (ii) the multisig treasury that receives the 0.5% fee. Both are isolated from user funds.

## 3. Not investment advice

- All information Roosta shows (payout tables, time-adjustment values, warnings) is **informational only** and **not investment advice**.
- Joining a circle is the user's decision. The platform does not guarantee any return.
- Crypto-assets (USDT, TON, etc.) carry price volatility. Any gain or loss caused by price movement is borne by the user.

## 4. Dispute resolution

Disputes escalate in this order:

1. **First: the organizer.** Operational disputes (defaults, member changes, schedule disagreements) are mediated by the organizer.
2. **Second: member consensus.** If the organizer cannot resolve it, a majority of members can request `emergencyCancel`.
3. **Third: platform intervention.** The platform only intervenes for **demonstrable smart-contract code bugs** that cause loss of funds. Operational disputes, organizer misconduct, and member-to-member disputes are not platform matters.

## 5. Refund policy

- If a circle does not complete and ends via `Cancel` or `emergencyCancel`, the smart contract automatically refunds unspent balances **pro-rata to contribution**.
- Amounts already paid out in past rounds are not refundable.
- The 0.5% platform fee is non-refundable. Whether organizer fees are refunded depends on the organizer's policy.

## 6. Prohibited use

Users must not:

- Use someone else's Telegram account or wallet without permission.
- Join a circle as a minor without legal-guardian consent.
- Use circles as a vehicle for money laundering, fraud, or moving illicit funds.
- Attempt unauthorized access to the contracts, bot, or API, or run automated abuse.

The platform may block bot access for offending Telegram accounts and cooperate with authorities when required. Blocks operate at the bot/Mini App layer; on-chain circles already running continue to execute according to their contract code.

## 7. Limitation of liability

The platform is not liable for:
- Organizer misconduct or operational mistakes.
- Member defaults, lost wallets, or lost seed phrases.
- TON network outages, gas spikes, or chain reorganizations.
- Telegram policy changes or service interruption.
- Outages of external RPC, indexers, or cloud providers (Vercel, Railway, Supabase).

Total platform liability is in no case greater than the fees the user paid directly to Roosta.

## 8. Telegram policy

Users must also comply with Telegram's [Terms of Service](https://telegram.org/tos) and [Bot Terms](https://telegram.org/tos/bots). If Telegram's policies change in a way that makes Roosta non-viable, the platform may discontinue the service with advance notice. (Citations to Telegram terms are placeholders pending final review.)

## 9. Governing law

- Governed by the laws of the Republic of Korea.
- First-instance jurisdiction: Seoul Central District Court.
- If Korean regulation of crypto-assets or ROSCAs changes materially, the platform may amend these terms with 30 days' notice.

> **Attorney review placeholder.** The legal status of ROSCAs under Korean law, the applicability of the Specific Financial Information Act to crypto-denominated ROSCAs, and the relationship to quasi-deposit-taking regulation all require attorney review before the final terms are published.

## 10. Amendments

- The platform may amend these terms. Changes are announced in-app and on the Telegram channel.
- Material changes carry 30 days' notice. Users who reject the amended terms may stop joining new circles; on-chain circles already in progress complete under the terms originally agreed.

---

## Appendix: Korean Summary (한국어 요약)

법률 검토 전 비공식 요약. 영문 본문이 정본입니다.

1. **역할.** Roosta는 인프라를 제공하고, 계주가 계를 운영하며, 계원이 가입 여부를 결정합니다. Roosta는 비수탁 — 모든 자금은 TON 스마트 컨트랙트가 보유합니다.
2. **투자 자문 아님.** 모든 화면 표시는 정보 제공 목적이며 투자 자문이 아닙니다. 가상자산 가치 변동 위험은 사용자 부담입니다.
3. **분쟁 해결.** 1차 계주, 2차 멤버 합의를 통한 `emergencyCancel`, 3차로 명백한 스마트 컨트랙트 버그에 한해 플랫폼 개입.
4. **환불.** 중도 취소 시 컨트랙트가 잔액을 비례 환불. 이미 지급된 라운드는 환불 불가. 플랫폼 수수료(0.5%)는 환불 불가.
5. **책임 한도.** 플랫폼 총 책임은 사용자가 Roosta에 직접 지불한 수수료 합계로 제한.
6. **준거법.** 대한민국법, 서울중앙지방법원 1심 관할.
7. **법률 검토 진행 중.** 본 문서는 초안. 한국 변호사 검토 후 최종본 게시 예정.
