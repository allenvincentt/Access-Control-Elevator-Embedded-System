import type { FaceQualityIssue, PresenceCode } from '@/services/face/constants';

export type FaceOutcome = 'granted' | 'denied' | 'error' | 'frameLost';

export type TelemetryGroup = 'presence' | 'issue' | 'outcome';

export type TelemetryTally = {
  key: string;
  count: number;
  share: number;
};

export type TelemetrySnapshot = {
  windowMs: number;
  total: number;
  oldestAgeMs: number | null;
  presence: TelemetryTally[];
  issues: TelemetryTally[];
  outcomes: TelemetryTally[];
};

type Entry = {
  at: number;
  group: TelemetryGroup;
  key: string;
};

const MAX_ENTRIES = 900;
const RETENTION_MS = 15 * 60 * 1000;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

let entries: Entry[] = [];

export function recordPresence(code: PresenceCode) {
  push('presence', code);
}

export function recordIssue(issue: FaceQualityIssue) {
  push('issue', issue);
}

export function recordOutcome(outcome: FaceOutcome) {
  push('outcome', outcome);
}

export function resetTelemetry() {
  entries = [];
}

export function snapshotTelemetry(windowMs = DEFAULT_WINDOW_MS): TelemetrySnapshot {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = entries.filter((entry) => entry.at >= cutoff);

  return {
    windowMs,
    total: recent.length,
    oldestAgeMs: recent.length ? now - recent[0].at : null,
    presence: tally(recent, 'presence'),
    issues: tally(recent, 'issue'),
    outcomes: tally(recent, 'outcome'),
  };
}

function push(group: TelemetryGroup, key: string) {
  const now = Date.now();
  entries.push({ at: now, group, key });

  const cutoff = now - RETENTION_MS;
  if (entries.length > MAX_ENTRIES || entries[0].at < cutoff) {
    entries = entries.filter((entry) => entry.at >= cutoff).slice(-MAX_ENTRIES);
  }
}

function tally(recent: Entry[], group: TelemetryGroup): TelemetryTally[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const entry of recent) {
    if (entry.group !== group) continue;
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
    total += 1;
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}
