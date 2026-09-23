import {
  PERSON_DETECTION,
  PERSON_ROI_WIDE,
  PERSON_SCOPE_FULL,
  PERSON_SCOPE_HALF,
  PERSON_SCOPES,
  type PersonRoi,
} from '@/services/person/constants';
import { acceptedBy, suppressDuplicates, type PersonBox } from '@/services/person/detector';
import { rectArea } from '@/services/person/geometry';

const LANDSCAPE = 4 / 3;

function box(left: number, top: number, right: number, bottom: number, score = 0.8): PersonBox {
  return {
    left,
    top,
    right,
    bottom,
    score,
    inRoi: false,
    scope: null,
    fit: { left, top, right, bottom },
  };
}

function edges(entry: PersonBox) {
  return {
    left: entry.left,
    top: entry.top,
    right: entry.right,
    bottom: entry.bottom,
  };
}

describe('suppressDuplicates', () => {
  it('returns an empty or single-box frame untouched', () => {
    expect(suppressDuplicates([])).toEqual([]);
    const single = [box(0.3, 0.1, 0.5, 0.9)];
    expect(suppressDuplicates(single)).toBe(single);
  });

  it('absorbs a torso box nested inside a stronger whole-body box', () => {
    const body = box(0.3, 0.1, 0.5, 0.9, 0.8);
    const torso = box(0.32, 0.1, 0.48, 0.5, 0.6);

    const kept = suppressDuplicates([torso, body]);

    expect(kept).toHaveLength(1);
    expect(edges(kept[0])).toEqual(edges(body));
    expect(kept[0].score).toBe(0.8);
  });

  it('keeps only the torso when a stronger torso would have to grow past maxMergeGrowth to cover the body', () => {
    const torso = box(0.32, 0.1, 0.48, 0.5, 0.9);
    const body = box(0.3, 0.1, 0.5, 0.9, 0.7);
    expect(rectArea(body) / rectArea(torso)).toBeGreaterThan(PERSON_DETECTION.maxMergeGrowth);

    const kept = suppressDuplicates([body, torso]);

    expect(kept).toHaveLength(1);
    expect(edges(kept[0])).toEqual(edges(torso));
  });

  it('keeps two people standing side by side apart', () => {
    const left = box(0.1, 0.1, 0.3, 0.9, 0.8);
    const right = box(0.35, 0.1, 0.55, 0.9, 0.75);

    const kept = suppressDuplicates([left, right]);

    expect(kept).toHaveLength(2);
    expect(kept.map(edges)).toEqual([edges(left), edges(right)]);
  });

  it('keeps two shoulder-to-shoulder people apart when their boxes only just touch', () => {
    const kept = suppressDuplicates([box(0.1, 0.1, 0.32, 0.9), box(0.3, 0.1, 0.52, 0.9, 0.7)]);
    expect(kept).toHaveLength(2);
  });

  it('absorbs a child standing in front of an adult into the adult (current behaviour, Phase 3 target)', () => {
    const adult = box(0.3, 0.1, 0.6, 0.95, 0.85);
    const child = box(0.38, 0.5, 0.52, 0.95, 0.7);

    const kept = suppressDuplicates([adult, child]);

    expect(kept).toHaveLength(1);
    expect(edges(kept[0])).toEqual(edges(adult));
  });

  it('compounds growth across chained merges past maxMergeGrowth of the original box (current behaviour, Phase 1.1 target)', () => {
    const first = box(0.4, 0.1, 0.5, 0.9, 0.9);
    const second = box(0.4, 0.1, 0.55, 0.9, 0.8);
    const third = box(0.45, 0.1, 0.6, 0.9, 0.7);
    expect(suppressDuplicates([first, third])).toHaveLength(2);

    const kept = suppressDuplicates([third, first, second]);

    expect(kept).toHaveLength(1);
    expect(kept[0].left).toBeCloseTo(0.4);
    expect(kept[0].right).toBeCloseTo(0.6);
    expect(kept[0].fit).toEqual(first.fit);
    expect(rectArea(kept[0]) / rectArea(first)).toBeGreaterThan(PERSON_DETECTION.maxMergeGrowth);
  });
});

describe('acceptedBy', () => {
  it('accepts a confident torso through the half-body scope', () => {
    expect(acceptedBy(box(0.4, 0.2, 0.5, 0.6, 0.5), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBe(
      PERSON_SCOPE_HALF,
    );
  });

  it('falls back to the full-body scope for a tall, less confident box', () => {
    expect(acceptedBy(box(0.4, 0.2, 0.5, 0.9, 0.42), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBe(
      PERSON_SCOPE_FULL,
    );
  });

  it('rejects a less confident box too short for the full-body scope', () => {
    expect(acceptedBy(box(0.4, 0.2, 0.5, 0.4, 0.42), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBeNull();
  });

  it('rejects a box below every score floor', () => {
    expect(acceptedBy(box(0.4, 0.2, 0.5, 0.9, 0.35), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBeNull();
  });

  it('rejects a bag-shaped box wider than it is tall', () => {
    expect(acceptedBy(box(0.3, 0.7, 0.6, 0.9, 0.9), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBeNull();
  });

  it('rejects a door-edge sliver far taller than a person', () => {
    expect(acceptedBy(box(0.5, 0.05, 0.536, 0.95, 0.9), PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBeNull();
  });

  it('measures aspect in pixels by dividing the landscape frame shape back out', () => {
    const narrow = box(0.46, 0.05, 0.536, 0.95, 0.9);
    expect(0.9 / 0.076).toBeGreaterThan(PERSON_SCOPE_HALF.maxAspect);
    expect(0.9 / 0.076 / LANDSCAPE).toBeLessThan(PERSON_SCOPE_HALF.maxAspect);
    expect(acceptedBy(narrow, PERSON_ROI_WIDE, PERSON_SCOPES, LANDSCAPE)).toBe(PERSON_SCOPE_HALF);
  });

  it('skips the shape gate when the frame aspect is unknown', () => {
    const sliver = box(0.5, 0.05, 0.536, 0.95, 0.9);
    expect(acceptedBy(sliver, PERSON_ROI_WIDE, PERSON_SCOPES, 0)).toBe(PERSON_SCOPE_HALF);
  });

  it('rejects someone filling more of the frame than maxArea (current behaviour, Phase 7.1 target)', () => {
    const closeUp = box(0.02, 0, 0.98, 1, 0.95);
    expect(acceptedBy(closeUp, PERSON_ROI_WIDE, PERSON_SCOPES, 0)).toBeNull();
  });

  it('rejects a box whose centre lies outside the region', () => {
    const roi: PersonRoi = { left: 0.2, top: 0, right: 0.8, bottom: 1 };
    expect(acceptedBy(box(0.05, 0.2, 0.15, 0.6, 0.9), roi, PERSON_SCOPES, LANDSCAPE)).toBeNull();
    expect(acceptedBy(box(0.45, 0.2, 0.55, 0.6, 0.9), roi, PERSON_SCOPES, LANDSCAPE)).toBe(PERSON_SCOPE_HALF);
  });

  it('anchors the full-body scope on the foot edge rather than the centre', () => {
    const roi: PersonRoi = { left: 0, top: 0, right: 1, bottom: 0.8 };
    const feetOutside = box(0.4, 0.1, 0.5, 0.9, 0.42);
    const feetInside = box(0.4, 0.05, 0.5, 0.75, 0.42);
    expect(acceptedBy(feetOutside, roi, [PERSON_SCOPE_FULL], LANDSCAPE)).toBeNull();
    expect(acceptedBy(feetInside, roi, [PERSON_SCOPE_FULL], LANDSCAPE)).toBe(PERSON_SCOPE_FULL);
  });
});
