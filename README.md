# MathiasSpeach

Telegram voice tutor for spoken Russian, and for spoken English for Russian speakers. POC.

The learner listens to a natural-sounding voice, answers with a voice message, and gets a spoken reply plus a short correction. Pronunciation is scored per word by an acoustic assessor, not guessed from a transcript: speech-to-text tends to "hear" the correct word even when it was mispronounced.

## Courses

Each learner picks a course on their first /start; the interface language follows from it:

| Course | Practice language | Interface, explanations, translations | Speech locale |
| --- | --- | --- | --- |
| `ru` | Russian | English | ru-RU |
| `en` | American English | Russian | en-US |

Everything that differs per course (tutor prompt priorities, hard sounds, spelling traps, locale) is in `src/courses.ts`; interface text is in `src/i18n.ts`. Learners from before courses existed are on `ru`. A learner can switch in ⚙️ Settings (🌐, then pick; the open lesson ends, words and tutor notes stay), and the owner can with `/course <userId> ru|en`.

## UI

The learner never types commands. A persistent keyboard under the input field holds the main menu:

| Button | What happens |
| --- | --- |
| 🗣 Talk | Pick a topic (café, taxi, work call, ...). Then role-play: voice in, voice out, corrections after each turn |
| 🎧 Repeat after me | Listen-and-repeat drill with a 0-100 score per word |
| ✍️ Dictation | Listen, type what you heard, get spelling feedback |
| 📚 My words | Saved words: 🔊 per word or all at once, ✏️ Edit to remove, ➕ Add word (typed or spoken, Russian or English) |
| 📈 Progress | Streak, today's sessions vs goal, last 7 days (sessions, minutes, spoken replies, drill scores, words), next focus |
| ⚙️ Settings | Reminders on/off, reminder times (hour and minute pickers), timezone (common cities or type your own), course (🌐) |

Buttons on tutor voice messages: 🐢 Slower (re-plays at 0.8x), 💡 Help me answer (two voiced suggestions), ➡️ Next, ⏹ Finish. The Russian text and English translation sit under spoilers, so you listen first. A voice or text message outside a drill starts a free conversation.

Owner-only commands (`OWNER_USER_ID`, default the first allowed user), hidden from the menu:

- `/voices [ru|en]`: blind test with the same phrase in every configured TTS voice (Russian by default). `/voice <elevenlabs|azure|openai>` switches the voice provider; each provider has its own voice per language.
- `/course <userId> ru|en`: change a learner's course. Tutor notes stay as they were.
- `/schedule [userId times timezone | userId on|off]`: view or set a learner's reminders.
- `/stats`: sessions per learner in the last 7 days.
- `/notes [userId]`: the tutor's private notes about a learner.

## Memory

Postgres keeps what outlives a message; only the lesson in progress lives in memory.

- `learners`: timezone, reminder times, and the tutor's notes plus "next focus".
- `lessons`, `turns`, `drill_attempts`: every conversation turn (text, correction, feedback, unclear words) and drill score. Voice audio is never stored.
- `words`: the learner's vocabulary.
- `sent_notifications`: one row per reminder or weekly summary, so each goes out once even with two instances running.

A lesson closes on ⏹ Finish, when another lesson starts, or after 60 minutes idle. Then Claude merges it into the learner's notes (level, recurring mistakes, strengths, pronunciation, topics). Those notes and recent words go into every lesson prompt, so the tutor revisits old mistakes and recycles vocabulary. After a restart, a talk lesson active in the last hour resumes with its history.

## Scheduler

In-process, every minute:

- Closes idle lessons and updates tutor notes. A failed Claude call is retried on the next tick.
- Sends a reminder within an hour after each reminder time in the learner's timezone, unless they practiced in the last 3 hours.
- Sends a weekly summary on Sunday between 20:00 and 22:00 local time.

## How a voice turn works

```
Telegram voice (OGG/Opus)
  -> ffmpeg -> 16 kHz mono WAV
  -> Azure STT (ru-RU or en-US, per course) -> text
  -> in parallel: Claude (reply + correction + new words)  |  Azure clarity check (<= 30 s)
  -> feedback text, then TTS (Azure / ElevenLabs / OpenAI) -> ffmpeg -> OGG/Opus voice message
```

In free conversation the clarity check only flags unclear words: it scores the audio against what recognition heard, so it can't tell a wrong word from a right one. Real pronunciation scores come from 🎧 Repeat after me, which assesses against a known target. Without Azure, OpenAI transcription is used and pronunciation features are skipped.

## Local setup

Requirements: Node 22+, Docker (for Postgres). ffmpeg comes from `ffmpeg-static`; set `FFMPEG_PATH` to use a system binary instead.

```bash
npm install
docker run -d --name mathias-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=mathias -p 55432:5432 postgres:17-alpine
cp .env.example .env   # fill in keys; never commit .env
npm run smoke:azure    # speech-to-text + pronunciation check, no Telegram needed; `npm run smoke:azure -- en` for English
npm run smoke:tts      # renders out/voice-<provider>.ogg for each configured voice
npm run dev            # long polling, restarts on file changes; the schema is created on start
```

1. Create a bot with @BotFather and put the token in `TELEGRAM_BOT_TOKEN`.
2. Message the bot. It replies with your Telegram user id. Add it to `ALLOWED_USER_IDS` and restart.

Only one instance can poll Telegram at a time: stop the local bot while the Railway one is running.

## Deploy (Railway)

Project `mathias-speech` has a `Postgres` service and a `bot` service. The bot's `DATABASE_URL` is `${{Postgres.DATABASE_URL}}`, and the other variables mirror `.env`.

```bash
railway up --service bot --detach -m "<summary>"
railway logs --service bot --lines 100
```

`railway up` skips `.gitignore`d files, so `.env` is never uploaded. During a deploy the old instance keeps polling for a few seconds. The new one retries Telegram's 409 Conflict for up to 2 minutes instead of crashing.

## Known POC limits

- The voice provider switch is global, not per learner (the voice itself follows the learner's course).
- Speech recognition listens in the practice language only. A voice message in the learner's own language comes out garbled; typed text in either language works.
- Azure short-audio REST caps: 60 s per voice message, 30 s for pronunciation scoring.
- For ru-RU, Azure gives no word-stress/prosody scoring and no phoneme names, only per-word and per-phoneme scores.
