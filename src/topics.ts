/** Role-play topics for 🗣 Talk, grouped so the picker stays two taps deep. */
export const TOPIC_CATEGORIES = ["everyday", "travel", "work", "people", "problems", "opinions"] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

const topic = <Id extends string>(id: Id, category: TopicCategory, scenario: string) => ({ id, category, scenario });

/** Scenarios are prompt text for Claude; button labels come from UiText.topics. */
export const TOPICS = [
  topic("cafe", "everyday", "ordering at a café"),
  topic("restaurant", "everyday", "dinner at a restaurant: getting a table, asking about dishes, ordering and paying"),
  topic("market", "everyday", "buying groceries at a market and asking about prices"),
  topic("taxi", "everyday", "a taxi ride: giving directions and small talk with the driver"),
  topic("pharmacy", "everyday", "explaining how they feel at a pharmacy"),
  topic("neighbour", "everyday", "meeting a new neighbour in the building"),
  topic("haircut", "everyday", "explaining what they want at a hairdresser or barber"),
  topic("delivery", "everyday", "sorting out a late or wrong delivery with a courier"),

  topic("airport", "travel", "at the airport: check-in, baggage, or a delayed or missed flight"),
  topic("hotel", "travel", "checking into a hotel and sorting out a problem with the room"),
  topic("directions", "travel", "lost in an unfamiliar city and asking a passer-by for directions"),
  topic("train", "travel", "buying train tickets and changing them after a mix-up"),
  topic("flat", "travel", "viewing a flat to rent and asking the landlord questions"),
  topic("car", "travel", "renting a car: insurance, conditions and returning it"),
  topic("border", "travel", "answering a border officer's questions about the trip"),
  topic("local", "travel", "asking a local what to see and where to eat, and reacting to their suggestions"),

  topic("work", "work", "a short call with a colleague"),
  topic("standup", "work", "a team stand-up: what they did, what is next, and what is blocking them"),
  topic("interview", "work", "a job interview: talking about their experience and answering follow-up questions"),
  topic("myjob", "work", "explaining their job or current project to someone outside the field"),
  topic("feedback", "work", "a one-on-one with a manager: giving and receiving feedback"),
  topic("negotiation", "work", "negotiating a deadline, scope or price with a client"),
  topic("smalltalk", "work", "small talk with a coworker before a meeting starts"),
  topic("disagree", "work", "politely disagreeing with a colleague's proposal in a meeting and offering an alternative"),

  topic("day", "people", "chatting with a friend about their day and plans"),
  topic("party", "people", "meeting someone new at a party and getting to know them"),
  topic("plans", "people", "making weekend plans with a friend and agreeing on the details"),
  topic("movies", "people", "recommending a film, series or book to a friend and saying why"),
  topic("hobby", "people", "talking about a hobby or sport with someone who shares it"),
  topic("story", "people", "telling a friend about something funny or strange that happened recently"),
  topic("advice", "people", "a friend asks for advice about a difficult decision"),
  topic("oldfriend", "people", "catching up with an old friend they haven't seen for years"),

  topic("doctor", "problems", "describing symptoms to a doctor and answering their questions"),
  topic("bank", "problems", "solving a problem at a bank: a blocked card or an unexpected charge"),
  topic("refund", "problems", "returning a faulty purchase and asking for a refund"),
  topic("repair", "problems", "calling a landlord or repairman about something broken at home"),
  topic("support", "problems", "a call with tech support about internet or a device that stopped working"),
  topic("noise", "problems", "asking a noisy neighbour to keep it down without starting a fight"),
  topic("lost", "problems", "reporting a lost phone or wallet and describing it"),
  topic("bill", "problems", "spotting a mistake in a bill and getting it fixed"),

  topic("debate", "opinions", "a friendly debate: the tutor takes the opposite side of an everyday opinion question (remote work or office, big city or small town, and so on)"),
  topic("tech", "opinions", "discussing how technology and AI are changing work and daily life"),
  topic("culture", "opinions", "comparing habits and traditions in their country with another country"),
  topic("dilemma", "opinions", "talking through a hypothetical 'what would you do if' dilemma"),
  topic("money", "opinions", "talking about money habits: saving, spending, and what is worth paying for"),
  topic("future", "opinions", "talking about plans for the next five years and what could get in the way"),
  topic("trip", "opinions", "describing the best or the worst trip they have ever had"),
  topic("habits", "opinions", "talking about a habit they want to change and why it is hard"),
];

export type TopicId = (typeof TOPICS)[number]["id"];

export const isTopicCategory = (value: unknown): value is TopicCategory => TOPIC_CATEGORIES.includes(value as TopicCategory);

export const randomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)]!;
