import {
  buildReport,
  formatReport,
  groupByCount,
  groupByTag,
  scoreClip,
  summarise,
  type ReplayFrame,
} from '@/services/person/metrics';

function frames(sequence: [count: number, stable: boolean][], stepMs = 250): ReplayFrame[] {
  return sequence.map(([count, stable], index) => ({
    capturedAt: 1_000 + index * stepMs,
    ok: true,
    count,
    stable,
    stats: { reported: 10, scanned: 10, decoded: 3, merged: 2, accepted: count, topScore: 0.7 },
    detectMs: 120,
  }));
}

const clip = (count: number, tags: ('occluded' | 'dim')[] = []) => ({
  id: `clip-${count}-${tags.join('-')}`,
  createdAt: 0,
  label: { count, tags },
});

describe('scoreClip', () => {
  it('marks a clip correct and times the first stable frame at the true count', () => {
    const score = scoreClip(
      clip(2),
      frames([
        [0, false],
        [1, false],
        [2, false],
        [2, false],
        [2, true],
      ]),
    );
    expect(score.outcome).toBe('correct');
    expect(score.finalCount).toBe(2);
    expect(score.settleMs).toBe(1_000);
    expect(score.firstStableMs).toBe(1_000);
    expect(score.stableUndercount).toBe(false);
    expect(score.durationMs).toBe(1_000);
  });

  it('flags a clip that settled low at any point even if it ended correct', () => {
    const score = scoreClip(
      clip(2),
      frames([
        [1, true],
        [2, false],
        [2, true],
      ]),
    );
    expect(score.outcome).toBe('correct');
    expect(score.stableUndercount).toBe(true);
    expect(score.firstStableMs).toBe(0);
    expect(score.settleMs).toBe(500);
  });

  it('scores the last stable count, not the last frame', () => {
    const score = scoreClip(
      clip(2),
      frames([
        [1, true],
        [2, false],
      ]),
    );
    expect(score.outcome).toBe('under');
    expect(score.finalCount).toBe(1);
    expect(score.settleMs).toBeNull();
  });

  it('reports overcounts and clips that never settle', () => {
    expect(scoreClip(clip(1), frames([[2, true]])).outcome).toBe('over');
    expect(scoreClip(clip(1), frames([[1, false]])).outcome).toBe('unsettled');
  });

  it('counts dropped frames and leaves them out of the stage means', () => {
    const recorded = frames([
      [1, false],
      [1, true],
    ]);
    recorded.splice(1, 0, {
      capturedAt: 1_100,
      ok: false,
      count: 0,
      stable: false,
      stats: null,
      detectMs: 30,
    });
    const score = scoreClip(clip(1), recorded);
    expect(score.frames).toBe(3);
    expect(score.dropped).toBe(1);
    expect(score.stages?.decoded).toBe(3);
    expect(score.meanDetectMs).toBeCloseTo(90);
  });
});

describe('summarise', () => {
  const scores = [
    scoreClip(clip(1), frames([[1, true]])),
    scoreClip(clip(2, ['occluded']), frames([[1, true]])),
    scoreClip(clip(2, ['occluded', 'dim']), frames([[3, true]])),
    scoreClip(clip(0), frames([[0, false]])),
  ];

  it('turns outcomes into rates over every clip', () => {
    const summary = summarise(scores);
    expect(summary.clips).toBe(4);
    expect(summary.accuracy).toBe(0.25);
    expect(summary.undercountRate).toBe(0.25);
    expect(summary.overcountRate).toBe(0.25);
    expect(summary.unsettledRate).toBe(0.25);
    expect(summary.medianSettleMs).toBe(0);
  });

  it('groups by rider count and by scenario tag', () => {
    expect(groupByCount(scores).map((group) => [group.key, group.summary.clips])).toEqual([
      ['0', 1],
      ['1', 1],
      ['2', 2],
    ]);
    expect(groupByTag(scores).map((group) => [group.key, group.summary.under])).toEqual([
      ['occluded', 1],
      ['dim', 0],
    ]);
  });

  it('renders a markdown report with the undercount rate', () => {
    const text = formatReport(
      buildReport({
        generatedAt: 0,
        model: { inputSize: 300, quantized: true },
        config: { stableFrames: 3 },
        scores,
      }),
    );
    expect(text).toContain('| **Undercount rate** | **25% (1/4)** |');
    expect(text).toContain('| Partly hidden | 2 |');
    expect(text).toContain('"stableFrames": 3');
  });
});
