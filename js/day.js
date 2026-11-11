// Creating a day's record and the state changes that span several modules.
// Pure: takes the state object and mutates it; the caller saves.
import { findById } from "./content.js";
import { pickAfter, pickBest, rankItems, usageBefore } from "./picks.js";
import { focusForDate, parseLocalDate } from "./schedule.js";

export const CORE_BLOCKS = ["anki", "listening", "focus"];

export function isGrammar(focusType) {
  return focusType === "grammar-learn" || focusType === "grammar-drill";
}

export function currentTopic(state, content) {
  const topics = content.grammar.topics;
  const i = state.grammar.currentIndex;
  return { topic: topics[i % topics.length], round: Math.floor(i / topics.length) + 1 };
}

// What counts as "used" for each rotation (only on days the block was ticked).
const used = {
  podcast: (d) => d.blocks?.listening?.done && d.blocks.listening.itemId,
  speaking: (d) => d.focusType === "speaking" && d.blocks?.focus?.done && d.blocks.focus.promptId,
  writing: (d) => d.focusType === "writing" && d.blocks?.focus?.done && d.blocks.focus.promptId,
  drill: (d) => d.focusType === "speaking" && d.blocks?.focus?.done && d.blocks.focus.drillId,
  // A dictée sentence counts as used once you've checked it, done box or not.
  dictation: (d) => (d.blocks?.focus?.dictation ?? []).map((r) => r.id),
};

export const DICTATION_PER_DAY = 3;

function usage(state, iso, kind) {
  return usageBefore(state.days, iso, used[kind]);
}

function blankDay(iso, config, todayIso) {
  return {
    focusType: focusForDate(parseLocalDate(iso), config),
    pickedOn: todayIso,
    blocks: {
      anki: { done: false },
      listening: { done: false, itemId: null, words: [] },
      focus: { done: false },
      log: { done: false, wentWell: "", fixNext: "" },
    },
    timers: {},
  };
}

/**
 * Get the record for `iso`, creating it and filling its picks if needed.
 * A day that was only previewed in advance (picked before it arrived, never touched)
 * gets fresh picks once it arrives, so it reflects the latest grammar topic and usage.
 */
export function ensureDay(state, iso, { config, content, todayIso = iso }) {
  let day = state.days[iso];
  const stalePreview = day && iso <= todayIso && (day.pickedOn ?? iso) < iso && !hasActivity(day);
  if (!day || stalePreview) {
    day = state.days[iso] = blankDay(iso, config, todayIso);
  }
  const { listening: L, focus: F } = day.blocks;
  const { topic } = currentTopic(state, content);

  if (!findById(content.podcasts.items, L.itemId)) {
    L.itemId = pickBest(content.podcasts.items, usage(state, iso, "podcast")).id;
  }
  if (isGrammar(day.focusType)) {
    if (!findById(content.grammar.topics, F.grammarTopic)) F.grammarTopic = topic.id;
    F.notes ??= "";
  } else if (day.focusType === "speaking") {
    if (!findById(content.speaking.items, F.promptId)) {
      F.promptId = pickBest(content.speaking.items, usage(state, iso, "speaking"), topic.id).id;
    }
    if (!findById(content.pronunciation.drills, F.drillId)) {
      F.drillId = pickBest(content.pronunciation.drills, usage(state, iso, "drill")).id;
    }
    F.rating ??= { fluency: null, pronunciation: null, accuracy: null };
    F.notes ??= "";
  } else if (day.focusType === "writing") {
    if (!findById(content.writing.items, F.promptId)) {
      F.promptId = pickBest(content.writing.items, usage(state, iso, "writing"), topic.id).id;
    }
    F.text ??= "";
    const known = (F.dictationIds ?? []).filter((id) => findById(content.dictation.items, id));
    if (known.length < Math.min(DICTATION_PER_DAY, content.dictation.items.length)) {
      F.dictationIds = rankItems(content.dictation.items, usage(state, iso, "dictation"))
        .slice(0, DICTATION_PER_DAY)
        .map((i) => i.id);
    }
    F.dictation ??= [];
  } else {
    F.notes ??= "";
  }
  return day;
}

/** "Pick another" for listening / speaking / writing. Returns the new item. */
export function pickAnother(state, iso, kind, content) {
  const day = state.days[iso];
  const { topic } = currentTopic(state, content);
  if (kind === "podcast") {
    const next = pickAfter(content.podcasts.items, usage(state, iso, "podcast"), day.blocks.listening.itemId);
    day.blocks.listening.itemId = next.id;
    return next;
  }
  const list = content[kind].items;
  const next = pickAfter(list, usage(state, iso, kind), day.blocks.focus.promptId, topic.id);
  day.blocks.focus.promptId = next.id;
  return next;
}

/**
 * Thursday verdict on the week's grammar topic. "got-it" moves the course to the topic
 * after this one; "again" (or un-setting) keeps it on this topic. Idempotent.
 */
export function setGrammarVerdict(state, iso, verdict, content) {
  const day = state.days[iso];
  const F = day.blocks.focus;
  const index = content.grammar.topics.findIndex((t) => t.id === F.grammarTopic);
  if (index < 0) return;
  const round = Math.floor(state.grammar.currentIndex / content.grammar.topics.length);
  const absolute = round * content.grammar.topics.length + index;

  F.verdict = verdict;
  if (verdict === "got-it") state.grammar.currentIndex = absolute + 1;
  else state.grammar.currentIndex = absolute;

  state.grammar.log = state.grammar.log.filter((e) => e.date !== iso);
  if (verdict) state.grammar.log.push({ date: iso, topicId: F.grammarTopic, verdict });
}

/** Status per topic id: "mastered" | "again" | undefined, from the verdict log. */
export function topicStatus(state) {
  const status = {};
  for (const e of [...state.grammar.log].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    status[e.topicId] = e.verdict === "got-it" ? "mastered" : "again";
  }
  return status;
}

export function coreDoneCount(day) {
  return CORE_BLOCKS.filter((k) => day?.blocks?.[k]?.done).length;
}

export function hasActivity(day) {
  if (!day) return false;
  const b = day.blocks ?? {};
  return (
    Object.values(b).some((x) => x?.done) ||
    (b.listening?.words?.length ?? 0) > 0 ||
    Boolean(b.focus?.text || b.focus?.notes || b.log?.wentWell || b.log?.fixNext) ||
    (b.focus?.recordingIds?.length ?? 0) > 0 ||
    (b.focus?.dictation?.length ?? 0) > 0
  );
}

/** Parse the words textarea: one entry per line, "mot = meaning" optional. */
export function parseWords(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function countWords(text) {
  // Count runs of letters (including accents), treating l'ami / aujourd'hui as single words.
  return (String(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

/** Fill the correction template from config ({prompt}, {grammar}, {text}). */
export function buildCorrectionPrompt(templateLines, { prompt, grammar, text }) {
  const fill = { prompt: prompt ?? "", grammar: grammar ?? "none this week", text: text.trim() };
  return templateLines
    .map((line) => line.replace(/\{(prompt|grammar|text)\}/g, (_, k) => fill[k]))
    .join("\n");
}

export function splitWord(entry) {
  const m = /^(.*?)\s*(?:=|→|->|:)\s*(.*)$/.exec(entry);
  return m ? { front: m[1].trim(), back: m[2].trim() } : { front: entry.trim(), back: "" };
}
