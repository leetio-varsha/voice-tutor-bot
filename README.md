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
| 🗣 Talk | Pick a category, then a topic; or 🎲 Surprise me, or ✍️ My topic (typed or spoken). Then role-play: voice in, voice out, corrections after each turn |
| 💎 Precise word | Recall drill for words you talked around in conversation: a different task each time (see Word ladder) |
| 🎧 Repeat after me | Listen-and-repeat drill with a 0-100 score per word |
| ✍️ Dictation | Listen, type what you heard, get spelling feedback |
| 📚 My words | Saved words: 🔊 per word or all at once, ✏️ Edit to remove, ➕ Add word (typed or spoken, Russian or English) |
| 📈 Progress | Streak, today's sessions vs goal, last 7 days (sessions, minutes, spoken replies, drill scores, words), next focus |
| ⚙️ Settings | Difficulty level (🎚), reminders on/off, reminder times (hour and minute pickers), timezone (common cities or type your own), course (🌐) |

Buttons on tutor voice messages: 🐢 Slower (re-plays at 0.8x), 💡 Help me answer (two voiced suggestions), ➡️ Next, ⏹ Finish. The Russian text and English translation sit under spoilers, so you listen first. A voice or text message outside a drill starts a free conversation.

## Topics and levels

Topics live in `src/topics.ts`: 48 scenarios in six categories (everyday, travel, work, friends, problems, opinions), with labels in `src/i18n.ts`. The scenario is only a seed: each role-play gets the learner's last 8 scenarios and is told to set up something different, so one topic plays out differently every time. 🎲 Surprise me draws the topic in code, not in the prompt.

A learner can set a difficulty level per course in ⚙️ Settings: Beginner (A1-A2), Intermediate (B1), Upper-intermediate (B2), Advanced (C1), or Auto. A set level changes how the tutor speaks, how complicated situations get and how picky corrections are (`LEVELS` in `src/courses.ts`), and wins over the level in the tutor's notes. Auto, the default, keeps the earlier behaviour: the tutor judges the level from its notes.

## Word ladder

For learners who get by on plain words and describe what they can't name. The aim is retrieving a word in speech, so nothing here is a flashcard with the answer on the back.

1. **Capture, in 🗣 Talk.** Each turn the tutor may flag a vocabulary gap: a roundabout description or a vague word where a specific one exists (`upgrades` in `TurnSchema`). It is shown as `💎 very tired → burned out` and saved with the learner's own line. At most 4 new words a day; past the cap gaps are not shown.
2. **Recall, in 💎 Precise word.** Up to 8 due words a session, answered by voice or text and checked by Claude. Each rung is a different task:

   | Rung | When | Task |
   | --- | --- | --- |
   | 0 | end of the lesson | The learner's own line, to say again with the precise word |
   | 1 | +1 day | A new situation, voiced, whose natural answer needs the word |
   | 2 | +3 days | Contrast with a near-synonym: two situations, pick the word for each |
   | 3 | +7 days | Two sentences about a real moment from the learner's own life |
   | 4 | +16 days | No drill: the word becomes a hidden target in role-plays |

   A miss moves the word down a rung and it returns the next day; so does talking around it again in conversation. Hints go from the learner's own wording to the meaning to the first letters, and a right answer after the first letters keeps the word on its rung.
3. **Finish line, back in 🗣 Talk.** The tutor gets up to 3 due rung-4 words as hidden targets: it never says them and steers toward a moment where they fit. A word is learned when the learner uses it unprompted (`used_targets`).

**Pictures.** With `OPENAI_API_KEY` set, each ladder word gets a picture: Claude describes a scene, the OpenAI image model draws it (`src/images.ts`), and it arrives a little after the reply, together with the word. On rung 1 the picture alone is the task, without the word; on the other rungs it is the first hint. 🎨 My own picture under it lets the learner describe their own scene instead. Each learner gets 8 pictures a day. Without a key nothing changes except that there are no pictures, and rung 1 is a spoken situation.

Words added with ➕ Add word join at rung 1. Words the tutor merely suggests after a turn (`new_words`) stay a plain list. State is in `words.stage` and `words.due_at`; the code is in `src/features/vocab.ts`.

Owner-only commands (`OWNER_USER_ID`, default the first allowed user), hidden from the menu:

- `/voices [ru|en]`: blind test with the same phrase in every configured TTS voice (Russian by default). `/voice <elevenlabs|azure|openai>` switches the voice provider; each provider has its own voice per language.
- `/course <userId> ru|en`: change a learner's course. Tutor notes stay as they were.
- `/schedule [userId times timezone | userId on|off]`: view or set a learner's reminders.
- `/stats`: sessions per learner in the last 7 days.
- `/notes [userId]`: the tutor's private notes about a learner.

## Memory

Postgres keeps what outlives a message; only the lesson in progress lives in memory.

- `learners`: timezone, reminder times, level per course, and the tutor's notes plus "next focus".
- `lessons`, `turns`, `drill_attempts`: every conversation turn (text, correction, feedback, unclear words) and drill score. Voice audio is never stored.
- `words`: the learner's vocabulary, with the ladder rung and next review time for words being drilled.
- `sent_notifications`: one row per reminder or weekly summary, so each goes out once even with two instances running.

A lesson closes on ⏹ Finish, when another lesson starts, or after 60 minutes idle. Then Claude merges it into the learner's notes (level, recurring mistakes, strengths, pronunciation, topics). Those notes and recent words go into every lesson prompt, so the tutor revisits old mistakes and recycles vocabulary. After a restart, a talk lesson active in the last hour resumes with its history.

## Scheduler

In-process, every minute:

- Closes idle lessons and updates tutor notes. A failed Claude call is retried on the next tick.
- Sends a reminder within an hour after each reminder time in the learner's timezone, unless they practiced in the last 3 hours.
- Sends a weekly summary on Sunday between 20:00 and 22:00 local time.

## One update at a time

grammY's long polling handles updates strictly in order, so a slow turn used to hold up every other learner, and a message sent five times while the bot was thinking got five answers. Now each update runs in the background (`src/bot.ts`), and while one is in progress the same learner's other messages are skipped with a single notice, and their button presses get a toast. A reply that takes longer than 1.5 s shows a "working on your answer" message, removed once the answer is out.

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
npm run smoke:image    # draws one word picture into out/, to check the OpenAI key and model (optional)
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

- A message sent while the bot is still answering the previous one is skipped, not queued.
- Word pictures are drawn by OpenAI's image model at low quality; the model name is `OPENAI_IMAGE_MODEL`.
- The voice provider switch is global, not per learner (the voice itself follows the learner's course).
- Speech recognition listens in the practice language only. A voice message in the learner's own language comes out garbled; typed text in either language works.
- Azure short-audio REST caps: 60 s per voice message, 30 s for pronunciation scoring.
- For ru-RU, Azure gives no word-stress/prosody scoring and no phoneme names, only per-word and per-phoneme scores.
