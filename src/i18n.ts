import type { Lang } from "./courses.js";

export type MenuKey = "talk" | "repeat" | "dictation" | "words" | "progress" | "settings";
export type TopicId = "cafe" | "taxi" | "market" | "neighbour" | "work" | "pharmacy" | "day" | "random";

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
  topics: Record<TopicId, string>;

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
  somethingWentWrong: string;

  repeatPrompt: string;
  noPronunciationScoring: (heard: string, target: string) => string;
  scores: (accuracy: number, fluency: number, completeness?: number) => string;
  sayAgain: string;
  dictationPrompt: string;
  perfect: string;
  correct: string;

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
      "🎧 Repeat after me: say a phrase and get a pronunciation score",
      "✍️ Dictation: listen and type what you hear",
      "📈 Progress: your streak and how you're improving",
      "⚙️ Settings: reminder times and timezone",
      "",
      "Or just hold the mic and say something in Russian.",
    ],
    topics: {
      cafe: "☕ Café",
      taxi: "🚕 Taxi",
      market: "🛒 Market",
      neighbour: "🏠 Neighbour",
      work: "💼 Work call",
      pharmacy: "💊 Pharmacy",
      day: "🗓 My day",
      random: "🎲 Surprise me",
    },

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
      "🎧 Повторяй за мной: произнеси фразу и получи оценку произношения",
      "✍️ Диктант: послушай и напиши, что слышишь",
      "📈 Прогресс: серия дней и как идут дела",
      "⚙️ Настройки: время напоминаний и часовой пояс",
      "",
      "Или просто зажми микрофон и скажи что-нибудь по-английски.",
    ],
    topics: {
      cafe: "☕ Кафе",
      taxi: "🚕 Такси",
      market: "🛒 Магазин",
      neighbour: "🏠 Сосед",
      work: "💼 Рабочий звонок",
      pharmacy: "💊 Аптека",
      day: "🗓 Мой день",
      random: "🎲 Удиви меня",
    },

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
