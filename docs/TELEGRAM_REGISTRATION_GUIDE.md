# Telegram Handle Registration Guide (Roosta Launch)

Step-by-step for registering and operating the three Telegram handles Roosta needs at launch. BotFather's UI changes often, so exact wording may vary — the flow and the values you provide will be the same.

Handles to register:

| Handle | Type | Purpose |
|---|---|---|
| `@RoostaBot` | Bot | Main bot — hosts the TMA (Mini App) |
| `@RoostaSupportBot` | Bot | Support channel — routes user inquiries |
| `@RoostaOfficial` | Channel | Announcements (not a bot) |

> Operational note: the handles above are likely already taken. Treat `@RoostaBot` / `@RoostaSupportBot` as **target names** and prepare 5 fallback candidates in step 1 (e.g. `@RoostaAppBot`, `@RoostaSocialBot`, `@RoostaSupport_Bot`).

---

## 0. Prerequisites

- One Telegram account (enable 2FA: SMS + password).
- HTTPS URL where the TMA is deployed (Vercel/Railway), e.g. `https://roosta-tma.vercel.app`.
- Brand profile picture: **512×512 PNG, under 1 MB, Roosta orange #FF7A29** background with a white R mark.
- A secret store for bot tokens (1Password, Railway Variables, Vercel Env).

---

## 1. Register `@RoostaBot` (main bot)

### 1.1. Create the bot

1. Search for `@BotFather` in Telegram and open the chat.
2. Send `/newbot`.
3. BotFather asks:
   - `Alright, a new bot. How are we going to call it?`
     **Answer:** `Roosta — Social Savings`
   - `Now let's choose a username for your bot. ... It must end in 'bot'.`
     **Answer:** `RoostaBot` (if taken, fall back to `RoostaAppBot`, `RoostaXyzBot`, etc.)
4. On success, BotFather sends the token:
   ```
   Use this token to access the HTTP API:
   123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
   ```
   **Never commit this token to a public repo.** Store it in 1Password immediately and add it to Railway/Vercel env as `TELEGRAM_BOT_TOKEN`.

### 1.2. Description / About text

5. `/setdescription` → select the bot → paste:
   ```
   Roosta — non-custodial social savings (kye) on Telegram. USDT-based automated rounds, transparent payouts, friend-based trust.
   ```
   (Korean variant: `Roosta는 텔레그램 친구들과 함께하는 비수탁 사회적 저축(계) 인프라입니다. USDT 기반 자동 라운드, 투명한 페이아웃, 친구간 신뢰로 운영됩니다.`)

6. `/setabouttext` → select the bot → one-liner (≤120 chars):
   ```
   Kye — non-custodial USDT savings circles with friends on Telegram.
   ```

### 1.3. Profile picture

7. `/setuserpic` → select the bot → upload 512×512 PNG. Anything below 512 is auto-rejected. Non-square images get cropped.

### 1.4. Command menu

8. `/setcommands` → select the bot → paste this block as-is:
   ```
   start - Start Roosta / view my circles
   mykyes - List the circles I've joined
   help - Help and FAQ
   settings - Notification / language settings
   lang - Switch language (ko / en)
   ```

### 1.5. Register the Web App (TMA)

9. `/newapp` → select the bot. BotFather walks through:
   - `Please provide a title for your Web App` → `Roosta`
   - `Please provide a short description` → `Start a circle, save together`
   - `Please upload a photo (640x360)` → upload 640×360 PNG
   - `Now please send me a demo GIF or skip with /empty` → `/empty`
   - `Please provide a URL for your Web App` →
     `https://roosta-tma.vercel.app`
   - `Choose a short name (4-30 chars, a-zA-Z0-9_)` → `app`
     (final deep link: `https://t.me/RoostaBot/app`)

10. `/setdomain` → select the bot → `roosta-tma.vercel.app` (or the prod domain). Only this domain can be invoked from `web_app` inline buttons.

### 1.6. Permissions

11. `/setjoingroups` → select the bot → `Enable` (so it can be added to group chats).
12. `/setprivacy` → select the bot → `Disable` (so the bot can read group messages — required for `/linkkye` and similar).
13. `/setinline`: **skip for V1** (no inline queries).

### 1.7. Webhook

Run once on the server (after Railway/Vercel deploy):

```bash
SECRET=$(openssl rand -hex 32)
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://api.roosta.app/telegram/webhook" \
  -d "secret_token=$SECRET" \
  -d "allowed_updates=[\"message\",\"callback_query\",\"my_chat_member\"]"
```

- Store `secret_token` as `TELEGRAM_WEBHOOK_SECRET` and verify it against the `X-Telegram-Bot-Api-Secret-Token` header on every inbound request.
- Verify: `curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`

### 1.8. Validation checklist

- [ ] Sending `/start` to `@RoostaBot` returns the welcome message + a `web_app` button.
- [ ] Tapping the `web_app` button opens the TMA (domain must match `setdomain`).
- [ ] `/help` returns a normal response.
- [ ] `/mykyes` returns a normal response (confirms DB connectivity).
- [ ] Adding the bot to a test group lets it read group messages.
- [ ] `getWebhookInfo` shows an empty `last_error_message`.

---

## 2. Register `@RoostaSupportBot` (support bot)

The support bot is a simple message router (user → ops Telegram group).

### 2.1. Create

1. `/newbot` to `@BotFather`.
2. Name: `Roosta Support`.
3. Username: `RoostaSupportBot` (fallback: `RoostaSupport_Bot`, `RoostaHelpBot`).
4. Store the token as `TELEGRAM_SUPPORT_BOT_TOKEN`.

### 2.2. Description

5. `/setdescription`:
   ```
   Having trouble with Roosta? Send us a message and the ops team will reply within 24 hours. For urgent matters, check @RoostaOfficial first.
   ```

6. `/setabouttext`:
   ```
   1:1 support channel with the Roosta ops team.
   ```

### 2.3. Commands

7. `/setcommands`:
   ```
   start - Begin a support session
   bug - Report a bug
   wallet - Wallet / transaction issue
   default - Default / missed contribution question
   contact - Ops team contact info
   ```

### 2.4. Permissions

8. `/setjoingroups` → `Disable` (support bot stays out of groups).
9. `/setprivacy` → `Enable` (DM only).

### 2.5. Profile picture

10. Same brand tone as the main bot, but differentiated with a "?" or headset icon. 512×512 PNG.

### 2.6. Webhook

Support bot uses its own endpoint:
```bash
curl -X POST "https://api.telegram.org/bot$SUPPORT_TOKEN/setWebhook" \
  -d "url=https://api.roosta.app/telegram/support-webhook" \
  -d "secret_token=$SUPPORT_SECRET"
```

Store the ops Telegram group ID as `SUPPORT_OPS_CHAT_ID` and `forwardMessage` incoming messages into that group.

### 2.7. Validation

- [ ] `/start` to `@RoostaSupportBot` shows the intro message.
- [ ] An arbitrary text DM is forwarded into the ops group.
- [ ] An ops reply is routed back to the user (bidirectional routing works).

---

## 3. `@RoostaOfficial` (announcements channel)

This is a Telegram **Channel**, not a bot. BotFather is not involved.

### 3.1. Create the channel

1. Telegram app → pencil icon (top right) → **New Channel**.
2. Channel name: `Roosta — Official`.
3. Description:
   ```
   Roosta official announcements. Releases, security advisories, operational policy changes, and incident notices land here. Beware of unofficial imitators.
   ```
4. Select **Public Channel** → username: `RoostaOfficial` (fallback: `RoostaOfficial_`, `Roosta_Official`).

### 3.2. Profile picture

5. Same logo as the main bot, with an "OFFICIAL" watermark in the background.

### 3.3. Add administrators

6. Channel settings → **Administrators** → **Add Admin** → search `@RoostaBot` → grant:
   - [x] Post Messages
   - [x] Edit Messages
   - [ ] Delete Messages
   - [ ] Add Subscribers
   - [ ] Promote Members

   The bot should only be able to post.

7. Add at least 2 ops team members as admins to avoid single-operator failure.

### 3.4. First message (pinned)

8. Send this and right-click → **Pin**:
   ```
   📌 Roosta — Social Savings on Telegram

   • Start the Mini App: @RoostaBot
   • 1:1 support: @RoostaSupportBot
   • Docs: https://roosta.app/docs
   • Security policy: https://roosta.app/security

   ⚠ This channel is post-only. Send questions to @RoostaSupportBot.
   ```

### 3.5. Bot ↔ channel wiring

Bot server env var:
```
TELEGRAM_ANNOUNCE_CHANNEL=@RoostaOfficial
```

In bot code, call `sendMessage(chat_id=@RoostaOfficial, ...)` to post announcements. Recommended auto-posts: new releases, contract upgrades, security advisories, outages over 24 hours.

### 3.6. Validation

- [ ] `t.me/RoostaOfficial` resolves publicly.
- [ ] `@RoostaBot` can `sendMessage` to the channel.
- [ ] Pinned message appears at the top with `@RoostaSupportBot` clickable.
- [ ] Discoverability: searching `Roosta` in Telegram surfaces the channel.

---

## 4. Token / secret storage summary

| Variable | Where stored | Used by |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Railway (api service), 1Password | `apps/bot`, `apps/backend` |
| `TELEGRAM_WEBHOOK_SECRET` | Railway | Webhook header verification |
| `TELEGRAM_SUPPORT_BOT_TOKEN` | Railway | Support router |
| `TELEGRAM_SUPPORT_WEBHOOK_SECRET` | Railway | Support webhook |
| `TELEGRAM_ANNOUNCE_CHANNEL` | Railway / Vercel | Announcement posts |
| `SUPPORT_OPS_CHAT_ID` | Railway | Ops group routing |

**Never commit these to GitHub.** Put only the variable names in `.env.example`, with empty values. If a token leaks, run `/revoke` in BotFather immediately to issue a new one.

---

## 5. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `/newbot`: "Sorry, this username is already taken." | Squatted handle | Have 5 candidate names ready (word + Bot suffix variants) |
| `web_app` button: "url not allowed" | Missing or mismatched `/setdomain` | Register the exact prod domain via `/setdomain` |
| Image upload rejected | Below 512px, non-square, or over 1 MB | `convert in.png -resize 512x512 out.png` with ImageMagick |
| Webhook not returning 200 | `secret_token` header check failed, or TLS cert issue | Check `last_error_message` in `getWebhookInfo` |
| Group messages don't reach the bot | Privacy mode is on | `/setprivacy` → `Disable`, then remove/re-add the bot to the group |
| Bots look confusingly similar | `RoostaBot` vs `RoostaSupportBot` | Differentiate profile picture and first-message tone clearly |
| Token leaked | Pushed to git by accident | `/revoke` → new token → update env vars → confirm old token disabled |

---

## 한국어 요약 (Korean Summary)

이 문서는 Roosta 출시에 필요한 세 개의 텔레그램 핸들 등록 절차를 단계별로 설명합니다.

1. **`@RoostaBot`** — Mini App을 호스팅하는 메인 봇. `@BotFather`의 `/newbot`으로 생성한 뒤 `/setdescription`, `/setabouttext`, `/setuserpic`, `/setcommands` (start, mykyes, help, settings, lang), `/newapp`으로 Web App 등록 (`https://roosta-tma.vercel.app`), `/setdomain`으로 프로덕션 URL 화이트리스트, `/setjoingroups Enable` 및 `/setprivacy Disable`을 설정해 `/linkkye` 등이 그룹 메시지를 읽을 수 있게 합니다. Webhook은 랜덤 `secret_token`을 사용해 매 요청마다 검증.

2. **`@RoostaSupportBot`** — 사용자 지원 라우터. 동일 절차이되 `/setjoingroups Disable`, `/setprivacy Enable`. 들어온 DM을 운영팀 텔레그램 그룹으로 전달하고, 운영팀의 답장은 사용자에게 다시 라우팅.

3. **`@RoostaOfficial`** — 공개 공지 **채널** (봇 아님). 텔레그램 클라이언트의 New Channel로 생성, `@RoostaBot`을 post-only 권한으로 admin 추가, 핀 메시지에 지원 봇과 문서 링크를 노출.

세 핸들 모두 Railway/Vercel 환경변수로 연동하며 토큰은 절대 git에 커밋하지 않습니다. 핸들마다 검증 체크리스트가 포함되어 있고, 자주 발생하는 문제(이름 선점, 프로필 사진 사이즈, webhook secret 검증, privacy mode 실수, `/revoke`를 통한 토큰 로테이션)도 정리되어 있습니다.
