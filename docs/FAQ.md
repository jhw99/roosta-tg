# FAQ

The top 20 questions, grouped by topic. For anything else, message `@RoostaSupportBot`.

---

## Basics

### 1. What is a ROSCA?

A ROSCA (Rotating Savings and Credit Association) is a group of N people who contribute the same amount C on a fixed cadence, building a pool of N × C, with one person taking the full pool each round. It's known as *kye* in Korea, *tanomoshi* in Japan, *arisan* in Indonesia, *susu* in West Africa. Roosta automates this with a smart contract.

### 2. How is this different from a bank savings account?

- **Early slots** are effectively zero-interest short-term loans, accessible even to people who can't get traditional credit.
- **Late slots** can yield more than a savings account thanks to the time adjustment (α_max) — though there's no guarantee.
- No central institution; a smart contract handles everything.

---

## Risk

### 3. What if the organizer scams me?

Roosta is **non-custodial**. The organizer cannot take off with anyone's funds — every transfer goes through the smart contract. The remaining risk is social engineering (e.g., an organizer stuffing slots with sock-puppet wallets). **Don't join circles run by people you don't know.**

### 4. What happens when someone defaults?

The default policy the organizer configured kicks in automatically:
- **ProRata** (recommended): that round's payout scales down proportionally; the circle continues.
- **Cancel:** the circle terminates and remaining funds are refunded pro-rata.
- **OrganizerCover:** the organizer covers the shortfall.

### 5. Can I get a refund?

- If the circle ends via `Cancel` or `emergencyCancel`, remaining balances refund pro-rata automatically.
- Already-paid rounds are not refundable.
- The 0.5% platform fee is non-refundable.

### 6. What if USDT or TON prices move?

Contributions and payouts are denominated in USDT, which is a USD-pegged stablecoin, so short-term volatility is low. There's always a small risk of a de-peg event (e.g. the 2023 USDC incident), and that risk is outside the platform's control.

### 7. What if the TON network goes down?

Round execution may be delayed. Once the network recovers, anyone can call `executeRound` and the circle resumes. The platform is not liable for losses caused by network downtime (see Terms).

---

## Operations

### 8. What if I lose my Telegram account?

Telegram itself can be recovered via SIM/email. But Roosta identifies users by `telegram_id`, so a new account won't receive notifications for your existing circle. **As long as you still have your wallet, payouts still arrive** — that's at the blockchain layer. Only the bot notifications break.

### 9. What if I lose my TON wallet?

Recover with your 12- or 24-word seed phrase. If the seed is gone too, the wallet is permanently lost. **Roosta cannot recover wallets either.** Write your seed on paper or steel and store it somewhere safe.

### 10. What is the platform responsible for?

- Contract correctness, bot reliability, Mini App availability.
- Scheduler accuracy and gas fees.
- **Not** responsible for: organizer mistakes, member defaults, lost wallets, market volatility, Telegram or TON outages.

### 11. Where does the 0.5% fee go?

Every round, 0.5% of the pool flows to the Roosta platform treasury (a 2-of-3 multisig). It funds infrastructure (gas, hosting, audits), engineering, and partial compensation in the event of platform-side incidents. The organizer's full fee F (minimum 2%) splits as 0.5% to the platform and `F − 0.5%` to the organizer.

---

## Legal / Tax

### 12. Is this legal in Korea?

Traditional *kye* sits in the private-contract space under Korean law and is generally not subject to criminal regulation. Because Roosta uses crypto, the Specific Financial Information Act (FIU) and rules around quasi-deposit-taking may apply. **A Korean attorney review is in progress (placeholder).** This FAQ will be updated with the formal opinion before launch.

### 13. What about taxes?

If `payout - cumulative contribution` is positive (typically for late slots), it may be taxable as other income or as a crypto capital gain. **Consult your own tax advisor.** Roosta does not provide tax advice.

### 14. Can minors join?

- Under 14: not allowed.
- 14–18: parent or legal guardian consent required (see Privacy Policy).
- 19+: free to join under your own responsibility.

---

## Technical

### 15. Is the smart contract code public?

Yes. Full Tact source is at `github.com/roosta-app/roosta`. Mainnet contracts are verified on Tonscan (see MAINNET_DEPLOY.md).

### 16. Isn't auto-withdraw permission dangerous?

The permission is tightly scoped:
- Only the one circle contract can pull.
- Exactly C USDT per round.
- Up to N pulls total (or until the circle ends).
- No other tokens, no other contracts, no other amounts.

### 17. Has the contract been audited?

Yes. The external audit report ships as a PDF in `docs/audit/` at launch.

### 18. Who pays for gas?

Round execution gas (~0.05–0.1 TON per round) is paid by Roosta's scheduler wallet. Members only pay gas for the one join transaction (~0.02 TON).

---

## Other

### 19. What if friends don't fill the slots?

The circle stays in `Created` and waits indefinitely. The organizer can call `emergencyCancel`; members who joined get a full refund (rounds haven't started yet).

### 20. Where can I learn more?

- Telegram channel: `@RoostaOfficial`
- Support bot: `@RoostaSupportBot`
- GitHub: `github.com/roosta-app/roosta`
- Docs: `docs.roosta.app`
