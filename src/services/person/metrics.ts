import {
  PERSON_CLIP_TAGS,
  type ClipLabel,
  type PersonClipTag,
} from '@/services/person/constants';
import type { DetectionStats } from '@/services/person/detector';

export type ReplayFrame = {
  capturedAt: number;
  ok: boolean;
  count: number;
  stable: boolean;
  stats: DetectionStats | null;
  detectMs: number;
};

export type ClipOutcome = 'correct' | 'under' | 'over' | 'unsettled';

export type StageMeans = DetectionStats;

export type ClipScore = {
  id: string;
  createdAt: number;
  label: ClipLabel;
  frames: number;
  dropped: number;
  durationMs: number;
  finalCount: number | null;
  outcome: ClipOutcome;
  stableUndercount: boolean;
  firstStableMs: number | null;
  settleMs: number | null;
  stages: StageMeans | null;
  meanDetectMs: number;
};

export type DatasetSummary = {
  clips: number;
  correct: number;
  under: number;
  over: number;
  unsettled: number;
  stableUndercount: number;
  accuracy: number;
  undercountRate: number;
  overcountRate: number;
  unsettledRate: number;
  stableUndercountRate: number;
  medianSettleMs: number | null;
  maxSettleMs: number | null;
  meanDetectMs: number;
};

export type GroupSummary = {
  key: string;
  summary: DatasetSummary;
};

export type ReplayModelInfo = {
  inputSize: number;
  quantized: boolean;
};

export type ReplayReport = {
  generatedAt: number;
  model: ReplayModelInfo;
  config: unknown;
  scores: ClipScore[];
  summary: DatasetSummary;
  byCount: GroupSummary[];
  byTag: GroupSummary[];
};

export function clipTagLabel(tag: PersonClipTag): string {
  return PERSON_CLIP_TAGS.find((entry) => entry.key === tag)?.label ?? tag;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stageMeans(frames: ReplayFrame[]): StageMeans | null {
  const stats = frames.flatMap((frame) => (frame.stats ? [frame.stats] : []));
  if (stats.length === 0) return null;
  return {
    reported: mean(stats.map((entry) => entry.reported)),
    scanned: mean(stats.map((entry) => entry.scanned)),
    decoded: mean(stats.map((entry) => entry.decoded)),
    merged: mean(stats.map((entry) => entry.merged)),
    accepted: mean(stats.map((entry) => entry.accepted)),
    topScore: mean(stats.map((entry) => entry.topScore)),
  };
}

export function scoreClip(
  clip: { id: string; createdAt: number; label: ClipLabel },
  frames: ReplayFrame[],
): ClipScore {
  const origin = frames[0]?.capturedAt ?? 0;
  const last = frames[frames.length - 1]?.capturedAt ?? origin;
  const expected = clip.label.count;
  const usable = frames.filter((frame) => frame.ok);
  const stable = usable.filter((frame) => frame.stable);

  const finalCount = stable.length > 0 ? stable[stable.length - 1].count : null;
  const outcome: ClipOutcome =
    finalCount === null
      ? 'unsettled'
      : finalCount === expected
        ? 'correct'
        : finalCount < expected
          ? 'under'
          : 'over';

  const firstStable = stable[0];
  const settled = stable.find((frame) => frame.count === expected);

  return {
    id: clip.id,
    createdAt: clip.createdAt,
    label: clip.label,
    frames: frames.length,
    dropped: frames.length - usable.length,
    durationMs: last - origin,
    finalCount,
    outcome,
    stableUndercount: stable.some((frame) => frame.count < expected),
    firstStableMs: firstStable ? firstStable.capturedAt - origin : null,
    settleMs: settled ? settled.capturedAt - origin : null,
    stages: stageMeans(usable),
    meanDetectMs: mean(frames.map((frame) => frame.detectMs)),
  };
}

function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

export function summarise(scores: ClipScore[]): DatasetSummary {
  const clips = scores.length;
  const count = (outcome: ClipOutcome) => scores.filter((score) => score.outcome === outcome).length;
  const correct = count('correct');
  const under = count('under');
  const over = count('over');
  const unsettled = count('unsettled');
  const stableUndercount = scores.filter((score) => score.stableUndercount).length;
  const settles = scores.flatMap((score) => (score.settleMs === null ? [] : [score.settleMs]));

  return {
    clips,
    correct,
    under,
    over,
    unsettled,
    stableUndercount,
    accuracy: rate(correct, clips),
    undercountRate: rate(under, clips),
    overcountRate: rate(over, clips),
    unsettledRate: rate(unsettled, clips),
    stableUndercountRate: rate(stableUndercount, clips),
    medianSettleMs: median(settles),
    maxSettleMs: settles.length > 0 ? Math.max(...settles) : null,
    meanDetectMs: mean(scores.map((score) => score.meanDetectMs)),
  };
}

export function groupByCount(scores: ClipScore[]): GroupSummary[] {
  const counts = [...new Set(scores.map((score) => score.label.count))].sort((a, b) => a - b);
  return counts.map((value) => ({
    key: String(value),
    summary: summarise(scores.filter((score) => score.label.count === value)),
  }));
}

export function groupByTag(scores: ClipScore[]): GroupSummary[] {
  return PERSON_CLIP_TAGS.flatMap(({ key }) => {
    const tagged = scores.filter((score) => score.label.tags.includes(key));
    return tagged.length > 0 ? [{ key, summary: summarise(tagged) }] : [];
  });
}

export function buildReport(input: {
  generatedAt: number;
  model: ReplayModelInfo;
  config: unknown;
  scores: ClipScore[];
}): ReplayReport {
  return {
    ...input,
    summary: summarise(input.scores),
    byCount: groupByCount(input.scores),
    byTag: groupByTag(input.scores),
  };
}

export function formatPercent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}% (${part}/${whole})`;
}

export function formatSeconds(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`;
}

const OUTCOME_LABEL: Record<ClipOutcome, string> = {
  correct: 'Correct',
  under: 'Under',
  over: 'Over',
  unsettled: 'Unsettled',
};

export function outcomeLabel(outcome: ClipOutcome): string {
  return OUTCOME_LABEL[outcome];
}

function table(header: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function groupTable(title: string, groups: GroupSummary[], name: (key: string) => string): string {
  if (groups.length === 0) return `## ${title}\n\nNo clips.`;
  return `## ${title}\n\n${table(
    ['Group', 'Clips', 'Correct', 'Under', 'Over', 'Unsettled', 'Stable under', 'Median settle', 'Max settle'],
    groups.map(({ key, summary }) => [
      name(key),
      String(summary.clips),
      formatPercent(summary.correct, summary.clips),
      formatPercent(summary.under, summary.clips),
      formatPercent(summary.over, summary.clips),
      formatPercent(summary.unsettled, summary.clips),
      formatPercent(summary.stableUndercount, summary.clips),
      formatSeconds(summary.medianSettleMs),
      formatSeconds(summary.maxSettleMs),
    ]),
  )}`;
}

function formatStages(stages: StageMeans | null): string {
  if (!stages) return '—';
  return `${stages.decoded.toFixed(1)} / ${stages.merged.toFixed(1)} / ${stages.accepted.toFixed(1)}`;
}

export function formatReport(report: ReplayReport): string {
  const { summary } = report;
  const frames = report.scores.reduce((total, score) => total + score.frames, 0);

  const overall = table(
    ['Metric', 'Value'],
    [
      ['Clips', String(summary.clips)],
      ['Frames', String(frames)],
      ['Count accuracy', formatPercent(summary.correct, summary.clips)],
      ['**Undercount rate**', `**${formatPercent(summary.under, summary.clips)}**`],
      ['Overcount rate', formatPercent(summary.over, summary.clips)],
      ['Never settled', formatPercent(summary.unsettled, summary.clips)],
      ['Stable undercount at any point', formatPercent(summary.stableUndercount, summary.clips)],
      ['Median time to correct stable count', formatSeconds(summary.medianSettleMs)],
      ['Max time to correct stable count', formatSeconds(summary.maxSettleMs)],
      ['Mean detection time', `${Math.round(summary.meanDetectMs)} ms`],
    ],
  );

  const clips = table(
    ['Clip', 'Riders', 'Tags', 'Frames', 'Dropped', 'Final', 'Outcome', 'Stable under', 'First stable', 'Settle', 'Gate / merged / in view', 'Top score', 'Detect'],
    report.scores.map((score) => [
      score.id,
      String(score.label.count),
      score.label.tags.map(clipTagLabel).join(', ') || '—',
      String(score.frames),
      String(score.dropped),
      score.finalCount === null ? '—' : String(score.finalCount),
      outcomeLabel(score.outcome),
      score.stableUndercount ? 'yes' : 'no',
      formatSeconds(score.firstStableMs),
      formatSeconds(score.settleMs),
      formatStages(score.stages),
      score.stages ? score.stages.topScore.toFixed(2) : '—',
      `${Math.round(score.meanDetectMs)} ms`,
    ]),
  );

  return [
    '# Person detection replay',
    '',
    `Generated ${new Date(report.generatedAt).toISOString()} · model input ${report.model.inputSize}×${report.model.inputSize} · ${report.model.quantized ? 'quantised' : 'float'}`,
    '',
    '## Overall',
    '',
    overall,
    '',
    groupTable('By rider count', report.byCount, (key) => `${key} riders`),
    '',
    groupTable('By scenario', report.byTag, (key) => clipTagLabel(key as PersonClipTag)),
    '',
    '## Per clip',
    '',
    clips,
    '',
    '## Configuration',
    '',
    '```json',
    JSON.stringify(report.config, null, 2),
    '```',
    '',
  ].join('\n');
}
