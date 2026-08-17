export type WebReviewSelectionReason = 'core_capability' | 'api_brand_mentioned' | 'random_unmentioned' | 'minimum_fill';

export type WebReviewSelectableSample = {
  id: number;
  engineId: number;
  question: string | null;
  answer: string;
  error: string | null;
  apiBrandMentioned: boolean;
};

export type WebReviewQuestion = { id: number; question: string; group: string };
export type WebReviewSelection = { sampleId: number; reasons: WebReviewSelectionReason[] };

const CORE_CAPABILITY_GROUP = '核心业务能力提问';

/**
 * Deterministically selects API samples for browser review.  The returned list
 * is sorted by sample id so that the persisted snapshot is stable as well as
 * the random decisions.
 */
export function selectWebReviewSamples(samples: WebReviewSelectableSample[], questions: WebReviewQuestion[], seed: string, minimumRate = 0.3): WebReviewSelection[] {
  const reasons = new Map<number, WebReviewSelectionReason[]>();
  const questionGroups = new Map(questions.map((question) => [question.question, question.group]));
  const answerable = samples.filter((sample) => !sample.error && sample.question && sample.answer.trim());
  const add = (sampleId: number, reason: WebReviewSelectionReason) => {
    const current = reasons.get(sampleId) ?? [];
    if (!current.includes(reason)) current.push(reason);
    reasons.set(sampleId, current);
  };

  for (const sample of samples.filter((sample) => sample.question)) {
    if (questionGroups.get(sample.question!) === CORE_CAPABILITY_GROUP) add(sample.id, 'core_capability');
    if (!sample.error && sample.apiBrandMentioned) add(sample.id, 'api_brand_mentioned');
  }

  const random = createSeededRandom(seed);
  const remaining = shuffled(answerable.filter((sample) => !reasons.has(sample.id) && !sample.apiBrandMentioned && questionGroups.get(sample.question!) !== CORE_CAPABILITY_GROUP), random);
  const randomCount = Math.ceil(remaining.length * 0.25);
  remaining.slice(0, randomCount).forEach((sample) => add(sample.id, 'random_unmentioned'));

  const minimum = Math.ceil(samples.length * Math.max(0, Math.min(1, minimumRate)));
  const fillCandidates = shuffled(answerable.filter((sample) => !reasons.has(sample.id)), random);
  for (const sample of fillCandidates) {
    if (reasons.size >= minimum) break;
    add(sample.id, 'minimum_fill');
  }

  return [...reasons.entries()]
    .map(([sampleId, selectedReasons]) => ({ sampleId, reasons: selectedReasons }))
    .sort((left, right) => left.sampleId - right.sampleId);
}

function createSeededRandom(seed: string) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
