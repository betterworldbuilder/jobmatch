// Hiring Stages: the timeline of rounds for one match (candidate × job), from
// "Mutual match" to the "Hired" finish line. Pure functions, tested with node --test.
import type { Job, JobMatch, PipelineStep, StepKind } from '../types';

export const KIND_LABEL: Record<StepKind, string> = {
  match: 'Match', hr: 'HR', technical: 'Technical', manager: 'Hiring manager', culture: 'Team & culture',
  assignment: 'Assignment', offer: 'Offer', hired: 'Hired', other: 'Other',
};

/** Guess a round's kind from its name ("Technical interview" → technical). */
export function kindOf(name: string): StepKind {
  const n = name.toLowerCase();
  if (/offer/.test(n)) return 'offer';
  if (/hire|accept|start/.test(n)) return 'hired';
  if (/take-home|assignment|test|exercise|case/.test(n)) return 'assignment';
  if (/tech|coding|system design|engineer|architecture/.test(n)) return 'technical';
  if (/manager|director|vp|cto|founder|ceo|leadership/.test(n)) return 'manager';
  if (/culture|team|values|peer/.test(n)) return 'culture';
  if (/hr|recruit|screen|talent|phone/.test(n)) return 'hr';
  return 'other';
}

const DEFAULT_ROUNDS = ['HR screening call', 'Technical interview', 'Hiring manager interview'];

/** Default steps for a job: Mutual match → one step per round in the job's process → Offer → Hired. */
export function defaultSteps(job?: Pick<Job, 'interviewProcess'>): PipelineStep[] {
  const rounds = job?.interviewProcess?.length ? job.interviewProcess : DEFAULT_ROUNDS;
  return [
    { id: 'match', name: 'Mutual match', owner: '', kind: 'match' },
    ...rounds.map((name, i) => ({ id: `round-${i + 1}`, name, owner: '', kind: kindOf(name) })),
    { id: 'offer', name: 'Offer', owner: '', kind: 'offer' },
    { id: 'hire', name: 'Hired', owner: '', kind: 'hired' },
  ];
}

export function stepsOf(match: Pick<JobMatch, 'pipeline' | 'job'>): PipelineStep[] {
  return (match.pipeline?.length ? match.pipeline : defaultSteps(match.job)).filter((s) => !s.hidden);
}

export type StepView = PipelineStep & { state: 'done' | 'current' | 'upcoming'; round?: number; finish: boolean };

/** Steps with their state and round number ("Round 2"); the last step is the finish line. */
export function timeline(match: Pick<JobMatch, 'pipeline' | 'job' | 'currentStepId'>): { steps: StepView[]; currentIndex: number; rounds: number; currentRound?: number } {
  const steps = stepsOf(match);
  let currentIndex = steps.findIndex((s) => s.id === match.currentStepId);
  if (currentIndex < 0) currentIndex = 0;
  let round = 0;
  const views = steps.map((s, i) => {
    const isRound = !['match', 'offer', 'hired'].includes(s.kind || kindOf(s.name)) && i > 0 && i < steps.length - 1;
    if (isRound) round += 1;
    return { ...s, kind: s.kind || kindOf(s.name), state: i < currentIndex ? 'done' as const : i === currentIndex ? 'current' as const : 'upcoming' as const, round: isRound ? round : undefined, finish: i === steps.length - 1 };
  });
  return { steps: views, currentIndex, rounds: round, currentRound: views[currentIndex]?.round };
}

/** "Round 2 of 3 · Technical interview" / "Offer stage" / "Hired". */
export function summary(match: Pick<JobMatch, 'pipeline' | 'job' | 'currentStepId'>): string {
  const t = timeline(match);
  const cur = t.steps[t.currentIndex];
  if (!cur) return '';
  if (cur.finish) return 'Hired — finish line reached';
  if (cur.round) return `Round ${cur.round} of ${t.rounds} · ${cur.name}`;
  return cur.kind === 'match' ? `Matched · ${t.rounds} rounds ahead` : `${cur.name} stage`;
}

/** "Tue, Nov 24" from YYYY-MM-DD (local, no time zone shift). */
export function formatDay(date?: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
