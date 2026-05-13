# Roosta GSD v1.0

**Telegram-Native ROSCA Protocol on TON**
Korean *kye* (契), reimagined as a Telegram Mini App.

- **Version**: 1.0 · Production MVP
- **Date**: 2026-05-12
- **Author**: Jhenry (Hyunwoo Jang)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Model](#2-product-model)
3. [System Architecture](#3-system-architecture)
4. [Smart Contract Specification](#4-smart-contract-specification)
5. [TMA UI Specification](#5-tma-ui-specification)
6. [Bot Notification Specification](#6-bot-notification-specification)
7. [Epic → Story → Task Breakdown](#7-epic--story--task-breakdown)
8. [Timeline & Milestones](#8-timeline--milestones)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Out of Scope (Future Roadmap)](#11-out-of-scope-future-roadmap)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

### 1.1 One-line definition

Roosta is on-chain infrastructure for starting, running, and settling a ROSCA (*kye*) with friends on Telegram. A smart contract handles contributions and payouts automatically, the Telegram bot delivers every notification, and the Mini App is where joining and management happen.

### 1.2 Why now, why TON

- ROSCAs are fundamentally a social protocol. Group trust is the core, and Telegram already provides that trust layer for free (group chats = trust groups).
- Telegram Mini Apps mean zero friction to join: one tap on a friend's link, you're in. No separate app install, no signup, no wallet onboarding step.
- TON gas is cheap. Weekly round execution is affordable to automate (~0.05 TON per round).
- Unbanked-market fit. The TON + Telegram user base overlaps directly with regions where ROSCA demand is highest: Southeast Asia, CIS, Africa.

### 1.3 Differentiation

- Explicit risk allocation for the organizer. The Terms and the UI make it clear the organizer carries operational responsibility; the platform only provides infrastructure.
- Time value priced into the protocol. Traditional ROSCAs have an unfair "slot 1 = free loan / slot N = free savings" asymmetry; α_max prices that asymmetry transparently.
- Telegram-native notifications. Every event — round start, default, payout — arrives instantly as a bot message.
- Not a Web3 wrapper, a real ROSCA. Positioned as a portable credit primitive for unbanked users, not yield-optimizing DeFi.

### 1.4 Business model

The platform fee is **0.5% flat** of each round's payout. Everything else — organizer fees, time adjustment — flows between organizer and members.

---

(The full GSD is the functional specification and is preserved as-is. For the complete spec, see `docs/GSD-FULL.md`, or section 7 of this file for the Epic → Story → Task breakdown.)
