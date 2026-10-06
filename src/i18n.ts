import type { Lang, Level } from "./courses.js";
import type { TopicCategory, TopicId } from "./topics.js";

export type MenuKey = "talk" | "vocab" | "repeat" | "dictation" | "words" | "progress" | "settings";

const pluralRules: Record<Lang, Intl.PluralRules> = { en: new Intl.PluralRules("en"), ru: new Intl.PluralRules("ru") };

/** Picks the plural form; Russian needs "one", "few" and "many" (1 день, 2 дня, 5 дней). */
function plural(lang: Lang, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  return forms[pluralRules[lang].select(n)] ?? forms.other;
}

/** Everything the learner reads, in their own language. The language they practice comes from Claude and TTS. */
export interface UiText {
  menu: Record<MenuKey, string>;
  micPlaceholder: string;
  welcome: string[];
  topicCategories: Record<TopicCategory, string>;
  topics: Record<TopicId, string>;
  surpriseMe: string;
  ownTopic: string;
  ownTopicPrompt: string;

  slower: string;
  helpMeAnswer: string;
  next: string;
  finish: string;

  pickTopic: string;
  topicIntro: string;
  iHeard: string;
  better: string;
  sayMoreClearly: string;
  youCouldSay: string;
  noSpeech: string;
  typeCityName: string;
  dictationNeedsTyping: string;
  useMenu: string;
  thinking: string;
  stillWorking: string;
  stillWorkingButton: string;
  somethingWentWrong: string;

  repeatPrompt: string;
  noPronunciationScoring: (heard: string, target: string) => string;
  scores: (accuracy: number, fluency: number, completeness?: number) => string;
  sayAgain: string;
  dictationPrompt: string;
  perfect: string;
  correct: string;

  upgrade: string;
  usedUnprompted: string;
  hint: string;
  skip: string;
  vocabNothingDue: string;
  ladder: (active: number, due: number, learned: number) => string;
  vocabReview: (count: number) => string;
  vocabAnchorIntro: string;
  vocabAnchorAsk: (said: string) => string;
  vocabSituationAsk: string;
  vocabContrastAsk: string;
  vocabStoryAsk: (meaning: string) => string;
  vocabPictureAsk: string;
  ownPicture: string;
  ownPicturePrompt: string;
  drawing: string;
  pictureLimit: string;
  pictureFailed: string;
  vocabHintSaid: (said: string) => string;
  vocabHintMeaning: (meaning: string) => string;
  vocabHintLetters: (mask: string) => string;
  vocabNoMoreHints: string;
  vocabMissed: string;
  vocabGoesWith: string;
  vocabNextIn: (days: number) => string;
  vocabAmbushNext: string;
  vocabHold: string;
  vocabSummary: (passed: number, total: number) => string;

  yourWords: string;
  yourLatestWords: (shown: number, total: number) => string;
  empty: string;
  listenToAll: string;
  edit: string;
  addWord: string;
  done: string;
  noWordsYet: string;
  sessionDone: string;
  sessionWords: string;
  addWordPrompt: string;
  added: string;
  alreadyInList: string;
  listen: string;
  addAnother: string;

  progressHeading: string;
  weeklyHeading: string;
  streak: (days: number) => string;
  noStreak: string;
  today: (done: number, goal: number) => string;
  last7Days: string;
  sessions: (count: number, minutes: number) => string;
  spokenReplies: (spoken: number, typed: number) => string;
  drills: (count: number) => string;
  averageScore: (score: number, lastWeek: number | null, up: boolean) => string;
  words: (total: number, fresh: number) => string;
  nextFocus: string;
  pronunciationDrill: string;

  settings: string;
  remindersOn: string;
  remindersOff: string;
  reminders: (on: boolean) => string;
  times: (list: string) => string;
  noTimes: string;
  timezone: (zone: string, clock: string) => string;
  addTime: string;
  changeTimezone: string;
  /** Settings button; carries a hint in the other language in case the course was picked by mistake. */
  changeCourse: string;
  courseSwitchNote: string;
  level: (label: string) => string;
  changeLevel: string;
  levelTitle: string;
  levelNote: string;
  levels: Record<Level | "auto", string>;
  addReminder: string;
  pickHour: string;
  pickTime: string;
  back: string;
  timezoneTitle: string;
  pickCity: string;
  typeMyCity: string;
  typeCityPrompt: string;
  cityNotFound: string;
  cities: Record<string, string>;

  reminder: (name: string) => string;
  reminderStreak: (days: number) => string;
  howAbout: (topic: string) => string;
  start: (topic: string) => string;
  otherTopic: string;
  quickDrill: string;
}

export const UI: Record<Lang, UiText> = {
  en: {
    menu: {
      talk: "🗣 Talk",
      vocab: "💎 Precise word",
      repeat: "🎧 Repeat after me",
      dictation: "✍️ Dictation",
      words: "📚 My words",
      progress: "📈 Progress",
      settings: "⚙️ Settings",
    },
    micPlaceholder: "Hold the mic and speak Russian",
    welcome: [
      "Привет! I'm your Russian speaking coach.",
      "",
      "🗣 Talk: a role-play conversation, voice in and voice out",
      "💎 Precise word: recall the words you talked around in conversation",
      "🎧 Repeat after me: say a phrase and get a pronunciation score",
      "✍️ Dictation: listen and type what you hear",
      "📈 Progress: your streak and how you're improving",
      "⚙️ Settings: difficulty level, reminder times and timezone",
      "",
      "Or just hold the mic and say something in Russian.",
    ],
    topicCategories: {
      everyday: "🏙 Everyday",
      travel: "✈️ Travel",
      work: "💼 Work",
      people: "👋 Friends",
      problems: "🧯 Problems",
      opinions: "💭 Opinions",
    },
    topics: {
      cafe: "☕ Café",
      restaurant: "🍽 Restaurant",
      market: "🛒 Market",
      taxi: "🚕 Taxi",
      pharmacy: "💊 Pharmacy",
      neighbour: "🏠 Neighbour",
      haircut: "💇 Haircut",
      delivery: "📦 Delivery",

      airport: "✈️ Airport",
      hotel: "🏨 Hotel",
      directions: "🧭 Directions",
      train: "🚆 Train tickets",
      flat: "🔑 Renting a flat",
      car: "🚗 Car rental",
      border: "🛂 Border control",
      local: "🗺 Local tips",

      work: "💼 Work call",
      standup: "📋 Stand-up",
      interview: "🎤 Job interview",
      myjob: "🧩 Explain my job",
      feedback: "💬 Feedback",
      negotiation: "🤝 Negotiation",
      smalltalk: "🫖 Office small talk",
      disagree: "🙅 Disagreeing",

      day: "🗓 My day",
      party: "🎉 Party",
      plans: "📅 Weekend plans",
      movies: "🎬 Movies & shows",
      hobby: "🎸 Hobbies",
      story: "📖 Tell a story",
      advice: "🫶 Giving advice",
      oldfriend: "👋 Old friend",

      doctor: "🩺 Doctor",
      bank: "🏦 Bank",
      refund: "🧾 Refund",
      repair: "🔧 Repairs",
      support: "🎧 Tech support",
      noise: "🔊 Noisy neighbour",
      lost: "🔍 Lost item",
      bill: "🧮 Wrong bill",

      debate: "⚖️ Debate",
      tech: "🤖 Tech & AI",
      culture: "🌍 Cultures",
      dilemma: "🧠 Dilemma",
      money: "💸 Money",
      future: "🔮 Plans & dreams",
      trip: "🏝 Best & worst trip",
      habits: "🌅 Habits",
    },
    surpriseMe: "🎲 Surprise me",
    ownTopic: "✍️ My topic",
    ownTopicPrompt: "What do you want to talk about? A situation, a person, anything. Type it in English or Russian, or say it in Russian.",

    slower: "🐢 Slower",
    helpMeAnswer: "💡 Help me answer",
    next: "➡️ Next",
    finish: "⏹ Finish",

    pickTopic: "What do you want to talk about?",
    topicIntro: "Listen, then hold the mic and answer in Russian. Stuck? Tap 💡.",
    iHeard: "I heard",
    better: "Better",
    sayMoreClearly: "Say these more clearly",
    youCouldSay: "You could say:",
    noSpeech: "I couldn't make out any speech there. Try again a bit closer to the mic.",
    typeCityName: "Please type the city name.",
    dictationNeedsTyping: "For dictation, type the sentence you heard.",
    useMenu: "Use the menu below.",
    thinking: "⏳ Working on your answer…",
    stillWorking: "⏳ I'm still answering your previous message, so I'll skip this one. Wait for the reply, then send it again if you still need to.",
    stillWorkingButton: "⏳ One moment, I'm still working on the answer",
    somethingWentWrong: "Sorry, something went wrong",

    repeatPrompt: "Listen, then hold the mic and say it.",
    noPronunciationScoring: (heard, target) =>
      `I heard: <i>${heard || "(nothing)"}</i>\nTarget: <b>${target}</b>\n\n(Pronunciation scoring needs Azure Speech configured.)`,
    scores: (accuracy, fluency, completeness) =>
      `accuracy ${accuracy} · fluency ${fluency}${completeness === undefined ? "" : ` · completeness ${completeness}`}`,
    sayAgain: "Say it again, or tap Next.",
    dictationPrompt: "Type what you hear.",
    perfect: "Perfect!",
    correct: "Correct",

    upgrade: "💎 More precise",
    usedUnprompted: "🏆 You used it on your own, so it's learned",
    hint: "💡 Hint",
    skip: "➡️ Skip",
    vocabNothingDue: "Nothing to recall right now. Words get here from 🗣 Talk: when you describe something instead of naming it, I catch the precise word (💎).",
    ladder: (active, due, learned) => `Word ladder: ${active} in progress, ${due} due, ${learned} learned`,
    vocabReview: (count) => `💎 Recall words (${count})`,
    vocabAnchorIntro: "In the conversation you said:",
    vocabAnchorAsk: (said) => `Say it again, with the precise word in place of "${said}".`,
    vocabSituationAsk: "Listen and answer in one sentence. One precise word belongs here.",
    vocabContrastAsk: "Two situations, two words. Say one sentence about each, with the word that fits.",
    vocabStoryAsk: (meaning) => `Tell me, in two sentences, about a real moment from your life that calls for the word meaning: ${meaning}`,
    vocabPictureAsk: "What's going on in the picture? Answer in one sentence, with the precise word.",
    ownPicture: "🎨 My own picture",
    ownPicturePrompt: "Describe the picture this word brings to your mind: who is in it and what is happening. Type it in English or Russian, or say it in Russian.",
    drawing: "🎨 Drawing it. It takes up to a minute, I'll send it when it's ready.",
    pictureLimit: "That's the picture limit for today. Try again tomorrow.",
    pictureFailed: "I couldn't draw that one. Try describing it differently.",
    vocabHintSaid: (said) => `Back then you said: ${said}`,
    vocabHintMeaning: (meaning) => `It means: ${meaning}`,
    vocabHintLetters: (mask) => `First letters: ${mask}`,
    vocabNoMoreHints: "No more hints. Give it a try, or tap Skip.",
    vocabMissed: "The word was",
    vocabGoesWith: "Goes with",
    vocabNextIn: (days) => `It comes back in ${days} ${plural("en", days, { one: "day", other: "days" })}, as a different task.`,
    vocabAmbushNext: "Last step: use it on your own in a conversation. I won't remind you.",
    vocabHold: "That counts, but with the first letters shown: it comes back tomorrow.",
    vocabSummary: (passed, total) => `Done: ${passed} of ${total}.`,

    yourWords: "Your words:",
    yourLatestWords: (shown, total) => `Your words (latest ${shown} of ${total}):`,
    empty: "(empty)",
    listenToAll: "🔊 Listen to all",
    edit: "✏️ Edit",
    addWord: "➕ Add word",
    done: "✅ Done",
    noWordsYet: "No words yet. Have a conversation, or add your own.",
    sessionDone: "Отлично поработали! See you next time.",
    sessionWords: "Отлично поработали! Words from this session:",
    addWordPrompt: "Send a word or phrase to save: type it or say it. Russian or English both work.",
    added: "Added",
    alreadyInList: "Already in your list",
    listen: "🔊 Listen",
    addAnother: "➕ Add another",

    progressHeading: "📈 Your progress",
    weeklyHeading: "🗓 Your week in Russian",
    streak: (days) => `🔥 Streak: ${days} ${plural("en", days, { one: "day", other: "days" })}`,
    noStreak: "🔥 Streak: start one today",
    today: (done, goal) => `Today: ${done} of ${goal} sessions`,
    last7Days: "Last 7 days",
    sessions: (count, minutes) => `• Sessions: ${count} (~${minutes} min)`,
    spokenReplies: (spoken, typed) => `• Spoken replies: ${spoken}${typed ? `, typed: ${typed}` : ""}`,
    drills: (count) => `• Drills: ${count}`,
    averageScore: (score, lastWeek, up) => `, average score ${score}${lastWeek === null ? "" : ` (${up ? "↑" : "↓"} from ${lastWeek})`}`,
    words: (total, fresh) => `• Words: ${total} total, ${fresh} new`,
    nextFocus: "🎯 Next focus",
    pronunciationDrill: "🎧 Pronunciation drill",

    settings: "⚙️ Settings",
    remindersOn: "⏰ Reminders: ON",
    remindersOff: "⏰ Reminders: OFF",
    reminders: (on) => `⏰ Reminders: ${on ? "on" : "off"}`,
    times: (list) => `Times: ${list}`,
    noTimes: "none",
    timezone: (zone, clock) => `🌍 Timezone: ${zone} (now ${clock})`,
    addTime: "➕ Add time",
    changeTimezone: "🌍 Change timezone",
    changeCourse: "🌐 Learning Russian · Сменить язык",
    courseSwitchNote: "Switching ends the current lesson. Your words and tutor notes are kept.\nТекущий урок закончится, слова и заметки тьютора сохранятся.",
    level: (label) => `🎚 Level: ${label}`,
    changeLevel: "🎚 Change level",
    levelTitle: "🎚 Difficulty level",
    levelNote: "Sets how I speak, how tricky the situations get and how picky my corrections are. It applies from the next lesson or drill.",
    levels: {
      auto: "🤖 Auto (tutor decides)",
      beginner: "🌱 Beginner (A1-A2)",
      intermediate: "🌿 Intermediate (B1)",
      upper: "🌳 Upper-intermediate (B2)",
      advanced: "🏔 Advanced (C1)",
    },
    addReminder: "⏰ Add a reminder",
    pickHour: "Pick the hour:",
    pickTime: "Pick the time:",
    back: "← Back",
    timezoneTitle: "🌍 Timezone",
    pickCity: "Pick the closest city, or type yours:",
    typeMyCity: "🏙 Type my city",
    typeCityPrompt: "Type your city (for example: Vienna, Tbilisi, Buenos Aires).",
    cityNotFound: "I couldn't find a timezone for that place. Open ⚙️ Settings and pick one from the list.",
    cities: {
      "Europe/Kyiv": "Kyiv",
      "Europe/Warsaw": "Warsaw",
      "Europe/Berlin": "Berlin",
      "Europe/London": "London",
      "Europe/Lisbon": "Lisbon",
      "Europe/Istanbul": "Istanbul",
      "Asia/Dubai": "Dubai",
      "Asia/Bangkok": "Bangkok",
      "America/New_York": "New York",
      "America/Los_Angeles": "Los Angeles",
    },

    reminder: (name) => `⏰ Time for 15 minutes of Russian${name ? `, ${name}` : ""}.`,
    reminderStreak: (days) => `🔥 ${days}-day streak, keep it going!`,
    howAbout: (topic) => `How about this one: ${topic}`,
    start: (topic) => `Start: ${topic}`,
    otherTopic: "Other topic",
    quickDrill: "🎧 Quick drill",
  },

  ru: {
    menu: {
      talk: "🗣 Разговор",
      vocab: "💎 Точное слово",
      repeat: "🎧 Повторяй за мной",
      dictation: "✍️ Диктант",
      words: "📚 Мои слова",
      progress: "📈 Прогресс",
      settings: "⚙️ Настройки",
    },
    micPlaceholder: "Зажми микрофон и говори по-английски",
    welcome: [
      "Hi! Я твой тренер разговорного английского.",
      "",
      "🗣 Разговор: ролевой диалог голосом, я отвечаю тоже голосом",
      "💎 Точное слово: вспоминаем слова, которые ты в разговоре обошёл описанием",
      "🎧 Повторяй за мной: произнеси фразу и получи оценку произношения",
      "✍️ Диктант: послушай и напиши, что слышишь",
      "📈 Прогресс: серия дней и как идут дела",
      "⚙️ Настройки: уровень сложности, время напоминаний и часовой пояс",
      "",
      "Или просто зажми микрофон и скажи что-нибудь по-английски.",
    ],
    topicCategories: {
      everyday: "🏙 Повседневное",
      travel: "✈️ Путешествия",
      work: "💼 Работа",
      people: "👋 Общение",
      problems: "🧯 Решить проблему",
      opinions: "💭 Мнения",
    },
    topics: {
      cafe: "☕ Кафе",
      restaurant: "🍽 Ресторан",
      market: "🛒 Магазин",
      taxi: "🚕 Такси",
      pharmacy: "💊 Аптека",
      neighbour: "🏠 Сосед",
      haircut: "💇 Парикмахерская",
      delivery: "📦 Доставка",

      airport: "✈️ Аэропорт",
      hotel: "🏨 Отель",
      directions: "🧭 Как пройти",
      train: "🚆 Билеты на поезд",
      flat: "🔑 Съём квартиры",
      car: "🚗 Аренда машины",
      border: "🛂 Паспортный контроль",
      local: "🗺 Советы местных",

      work: "💼 Рабочий звонок",
      standup: "📋 Стендап",
      interview: "🎤 Собеседование",
      myjob: "🧩 Объяснить свою работу",
      feedback: "💬 Фидбэк",
      negotiation: "🤝 Переговоры",
      smalltalk: "🫖 Болтовня с коллегой",
      disagree: "🙅 Возразить коллеге",

      day: "🗓 Мой день",
      party: "🎉 Вечеринка",
      plans: "📅 Планы на выходные",
      movies: "🎬 Кино и сериалы",
      hobby: "🎸 Хобби",
      story: "📖 Рассказать историю",
      advice: "🫶 Дать совет",
      oldfriend: "👋 Старый друг",

      doctor: "🩺 Врач",
      bank: "🏦 Банк",
      refund: "🧾 Возврат товара",
      repair: "🔧 Ремонт",
      support: "🎧 Техподдержка",
      noise: "🔊 Шумный сосед",
      lost: "🔍 Потерянная вещь",
      bill: "🧮 Ошибка в счёте",

      debate: "⚖️ Спор",
      tech: "🤖 Технологии и ИИ",
      culture: "🌍 Культуры",
      dilemma: "🧠 Дилемма",
      money: "💸 Деньги",
      future: "🔮 Планы и мечты",
      trip: "🏝 Лучшая и худшая поездка",
      habits: "🌅 Привычки",
    },
    surpriseMe: "🎲 Удиви меня",
    ownTopic: "✍️ Своя тема",
    ownTopicPrompt: "О чём хочешь поговорить? Ситуация, собеседник, что угодно. Напиши по-русски или по-английски, или скажи по-английски.",

    slower: "🐢 Медленнее",
    helpMeAnswer: "💡 Помоги ответить",
    next: "➡️ Дальше",
    finish: "⏹ Закончить",

    pickTopic: "О чём поговорим?",
    topicIntro: "Послушай, потом зажми микрофон и ответь по-английски. Не знаешь, что сказать? Нажми 💡.",
    iHeard: "Распознано",
    better: "Лучше так",
    sayMoreClearly: "Произнеси чётче",
    youCouldSay: "Можно сказать так:",
    noSpeech: "Не получилось разобрать речь. Попробуй ещё раз, чуть ближе к микрофону.",
    typeCityName: "Напиши название города текстом.",
    dictationNeedsTyping: "В диктанте фразу нужно напечатать.",
    useMenu: "Пользуйся меню внизу.",
    thinking: "⏳ Готовлю ответ…",
    stillWorking: "⏳ Я ещё отвечаю на предыдущее сообщение, поэтому это пропущу. Дождись ответа и пришли заново, если всё ещё нужно.",
    stillWorkingButton: "⏳ Секунду, ещё готовлю ответ",
    somethingWentWrong: "Что-то пошло не так",

    repeatPrompt: "Послушай, потом зажми микрофон и повтори.",
    noPronunciationScoring: (heard, target) =>
      `Распознано: <i>${heard || "(ничего)"}</i>\nНужно было: <b>${target}</b>\n\n(Для оценки произношения нужен Azure Speech.)`,
    scores: (accuracy, fluency, completeness) =>
      `точность ${accuracy} · беглость ${fluency}${completeness === undefined ? "" : ` · полнота ${completeness}`}`,
    sayAgain: "Скажи ещё раз или нажми «Дальше».",
    dictationPrompt: "Напиши, что слышишь.",
    perfect: "Идеально!",
    correct: "Правильно",

    upgrade: "💎 Точнее",
    usedUnprompted: "🏆 Сам употребил в разговоре, слово выучено",
    hint: "💡 Подсказка",
    skip: "➡️ Пропустить",
    vocabNothingDue: "Сейчас вспоминать нечего. Слова попадают сюда из 🗣 Разговора: когда ты описываешь вместо точного слова, я его ловлю (💎).",
    ladder: (active, due, learned) => `Лестница слов: в работе ${active}, к повторению ${due}, выучено ${learned}`,
    vocabReview: (count) => `💎 Вспомнить слова (${count})`,
    vocabAnchorIntro: "В разговоре ты сказал:",
    vocabAnchorAsk: (said) => `Скажи это ещё раз, но вместо «${said}» возьми точное слово.`,
    vocabSituationAsk: "Послушай и ответь одной фразой. Сюда просится одно точное слово.",
    vocabContrastAsk: "Две ситуации, два слова. Скажи по одной фразе про каждую, с подходящим словом.",
    vocabStoryAsk: (meaning) => `Расскажи в двух предложениях реальный случай из своей жизни, где нужно слово со значением: ${meaning}`,
    vocabPictureAsk: "Что происходит на картинке? Ответь одной фразой, с точным словом.",
    ownPicture: "🎨 Своя картинка",
    ownPicturePrompt: "Опиши картинку, которая у тебя самого связана с этим словом: кто на ней и что происходит. Напиши по-русски или по-английски, или скажи по-английски.",
    drawing: "🎨 Рисую. Это до минуты, пришлю, когда будет готово.",
    pictureLimit: "На сегодня лимит картинок исчерпан. Попробуй завтра.",
    pictureFailed: "Эту картинку нарисовать не получилось. Попробуй описать иначе.",
    vocabHintSaid: (said) => `Тогда ты сказал: ${said}`,
    vocabHintMeaning: (meaning) => `Значение: ${meaning}`,
    vocabHintLetters: (mask) => `Первые буквы: ${mask}`,
    vocabNoMoreHints: "Подсказок больше нет. Попробуй ответить или нажми «Пропустить».",
    vocabMissed: "Нужное слово",
    vocabGoesWith: "С чем сочетается",
    vocabNextIn: (days) => `Вернётся через ${days} ${plural("ru", days, { one: "день", few: "дня", many: "дней", other: "дня" })}, уже другим заданием.`,
    vocabAmbushNext: "Последняя ступень: употреби его сам в разговоре. Напоминать не буду.",
    vocabHold: "Засчитано, но с первыми буквами: вернётся завтра.",
    vocabSummary: (passed, total) => `Готово: ${passed} из ${total}.`,

    yourWords: "Твои слова:",
    yourLatestWords: (shown, total) => `Твои слова (последние ${shown} из ${total}):`,
    empty: "(пусто)",
    listenToAll: "🔊 Послушать все",
    edit: "✏️ Изменить",
    addWord: "➕ Добавить слово",
    done: "✅ Готово",
    noWordsYet: "Слов пока нет. Поговори со мной или добавь свои.",
    sessionDone: "Great job! До следующего раза.",
    sessionWords: "Great job! Слова из этого занятия:",
    addWordPrompt: "Пришли слово или фразу: текстом или голосом. Можно по-английски или по-русски.",
    added: "Добавлено",
    alreadyInList: "Уже есть в списке",
    listen: "🔊 Послушать",
    addAnother: "➕ Добавить ещё",

    progressHeading: "📈 Твой прогресс",
    weeklyHeading: "🗓 Твоя неделя английского",
    streak: (days) => `🔥 Серия: ${days} ${plural("ru", days, { one: "день", few: "дня", many: "дней", other: "дня" })}`,
    noStreak: "🔥 Серия: начни сегодня",
    today: (done, goal) => `Сегодня: ${done} из ${goal} занятий`,
    last7Days: "За 7 дней",
    sessions: (count, minutes) => `• Занятий: ${count} (~${minutes} мин)`,
    spokenReplies: (spoken, typed) => `• Ответов голосом: ${spoken}${typed ? `, текстом: ${typed}` : ""}`,
    drills: (count) => `• Упражнений: ${count}`,
    averageScore: (score, lastWeek, up) => `, средняя оценка ${score}${lastWeek === null ? "" : ` (${up ? "↑" : "↓"} с ${lastWeek})`}`,
    words: (total, fresh) => `• Слов: всего ${total}, новых ${fresh}`,
    nextFocus: "🎯 Над чем поработать",
    pronunciationDrill: "🎧 Произношение",

    settings: "⚙️ Настройки",
    remindersOn: "⏰ Напоминания: ВКЛ",
    remindersOff: "⏰ Напоминания: ВЫКЛ",
    reminders: (on) => `⏰ Напоминания: ${on ? "включены" : "выключены"}`,
    times: (list) => `Время: ${list}`,
    noTimes: "не задано",
    timezone: (zone, clock) => `🌍 Часовой пояс: ${zone} (сейчас ${clock})`,
    addTime: "➕ Добавить время",
    changeTimezone: "🌍 Сменить пояс",
    changeCourse: "🌐 Учу английский · Change language",
    courseSwitchNote: "Текущий урок закончится, слова и заметки тьютора сохранятся.\nSwitching ends the current lesson. Your words and tutor notes are kept.",
    level: (label) => `🎚 Уровень: ${label}`,
    changeLevel: "🎚 Сменить уровень",
    levelTitle: "🎚 Уровень сложности",
    levelNote: "От уровня зависит, как я говорю, насколько запутанные ситуации и насколько придирчивые исправления. Действует со следующего урока или упражнения.",
    levels: {
      auto: "🤖 Авто (решает тьютор)",
      beginner: "🌱 Начальный (A1-A2)",
      intermediate: "🌿 Средний (B1)",
      upper: "🌳 Выше среднего (B2)",
      advanced: "🏔 Продвинутый (C1)",
    },
    addReminder: "⏰ Новое напоминание",
    pickHour: "Выбери час:",
    pickTime: "Выбери время:",
    back: "← Назад",
    timezoneTitle: "🌍 Часовой пояс",
    pickCity: "Выбери ближайший город или напиши свой:",
    typeMyCity: "🏙 Написать город",
    typeCityPrompt: "Напиши свой город (например: Вена, Тбилиси, Буэнос-Айрес).",
    cityNotFound: "Не получилось найти часовой пояс для этого места. Открой ⚙️ Настройки и выбери из списка.",
    cities: {
      "Europe/Kyiv": "Киев",
      "Europe/Warsaw": "Варшава",
      "Europe/Berlin": "Берлин",
      "Europe/London": "Лондон",
      "Europe/Lisbon": "Лиссабон",
      "Europe/Istanbul": "Стамбул",
      "Asia/Dubai": "Дубай",
      "Asia/Bangkok": "Бангкок",
      "America/New_York": "Нью-Йорк",
      "America/Los_Angeles": "Лос-Анджелес",
    },

    reminder: (name) => `⏰ Время для 15 минут английского${name ? `, ${name}` : ""}.`,
    reminderStreak: (days) => `🔥 Серия ${days} ${plural("ru", days, { one: "день", few: "дня", many: "дней", other: "дня" })}, не прерывай!`,
    howAbout: (topic) => `Как насчёт этой темы: ${topic}`,
    start: (topic) => `Начать: ${topic}`,
    otherTopic: "Другая тема",
    quickDrill: "🎧 Быстрое упражнение",
  },
};

/** A menu button's label in every interface language, for handlers that react to it. */
export const menuLabels = (key: MenuKey): string[] => Object.values(UI).map((ui) => ui.menu[key]);

export const ALL_MENU_LABELS: string[] = Object.values(UI).flatMap((ui) => Object.values(ui.menu));

/** Shown on /start before a new learner has picked a course, so it speaks both languages. */
export const COURSE_PICKER = {
  question: "Which language are you learning?\nКакой язык ты учишь?",
  ru: "🇷🇺 Russian (I speak English)",
  en: "🇺🇸 Английский (я говорю по-русски)",
};
