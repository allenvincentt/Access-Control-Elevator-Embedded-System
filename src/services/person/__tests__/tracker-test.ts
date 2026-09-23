import { PERSON_DETECTION } from '@/services/person/constants';
import type { PersonBox } from '@/services/person/detector';
import { PersonTracker, type TrackedCount } from '@/services/person/tracker';

function box(left: number, top: number, right: number, bottom: number, inRoi = true): PersonBox {
  return {
    left,
    top,
    right,
    bottom,
    score: 0.8,
    inRoi,
    scope: inRoi ? 'centre' : null,
    fit: { left, top, right, bottom },
  };
}

function feed(tracker: PersonTracker, frames: PersonBox[][]): TrackedCount[] {
  return frames.map((boxes) => tracker.push(boxes));
}

const body = box(0.3, 0.1, 0.5, 0.9);
const torso = box(0.32, 0.1, 0.48, 0.5);
const adult = box(0.3, 0.1, 0.6, 0.95);
const child = box(0.38, 0.5, 0.52, 0.95);

describe('PersonTracker', () => {
  it('counts a person only after trackConfirmFrames frames', () => {
    const counts = feed(new PersonTracker(), [[body], [body]]).map((frame) => frame.count);
    expect(PERSON_DETECTION.trackConfirmFrames).toBe(2);
    expect(counts).toEqual([0, 1]);
  });

  it('ignores boxes outside the region', () => {
    const counts = feed(new PersonTracker(), [[box(0.3, 0.1, 0.5, 0.9, false)], [box(0.3, 0.1, 0.5, 0.9, false)]]);
    expect(counts.map((frame) => frame.count)).toEqual([0, 0]);
  });

  it('reports stable once the same count holds for stableFrames frames', () => {
    const frames = feed(new PersonTracker(), [[body], [body], [body], [body]]);
    expect(frames.map((frame) => frame.count)).toEqual([0, 1, 1, 1]);
    expect(frames.map((frame) => frame.stable)).toEqual([false, false, false, true]);
    expect(frames[3].progress).toBe(1);
  });

  it('confirms a box that flickers in, out and back within trackMissLimit (current behaviour, Phase 1.2 target)', () => {
    const counts = feed(new PersonTracker(), [[body], [], [body]]).map((frame) => frame.count);
    expect(counts).toEqual([0, 0, 1]);
  });

  it('keeps counting a confirmed person through trackCountGrace missed frames', () => {
    const counts = feed(new PersonTracker(), [[body], [body], [], [], []]).map((frame) => frame.count);
    expect(PERSON_DETECTION.trackCountGrace).toBe(2);
    expect(counts).toEqual([0, 1, 1, 1, 0]);
  });

  it('follows a person whose box shrinks to a torso without opening a second track', () => {
    const frames = feed(new PersonTracker(), [[body], [body], [torso], [torso]]);
    expect(frames.map((frame) => frame.count)).toEqual([0, 1, 1, 1]);
    expect(frames[3].tracks).toHaveLength(1);
  });

  it('treats a torso box nested in a live body track as a fragment, not a new person', () => {
    const frames = feed(new PersonTracker(), [[body], [body], [body, torso], [body, torso]]);
    expect(frames.map((frame) => frame.count)).toEqual([0, 1, 1, 1]);
  });

  it('counts two people standing side by side', () => {
    const left = box(0.1, 0.1, 0.3, 0.9);
    const right = box(0.35, 0.1, 0.55, 0.9);
    const counts = feed(new PersonTracker(), [[left, right], [left, right]]).map((frame) => frame.count);
    expect(counts).toEqual([0, 2]);
  });

  it('counts a child standing in front of an adult as one person (current behaviour, Phase 3 target)', () => {
    const counts = feed(new PersonTracker(), [[adult, child], [adult, child], [adult, child]]).map(
      (frame) => frame.count,
    );
    expect(counts).toEqual([0, 1, 1]);
  });

  it('merges a person who steps mostly behind another (current behaviour, Phase 3 target)', () => {
    const front = box(0.3, 0.1, 0.55, 0.9);
    const beside = box(0.5, 0.1, 0.7, 0.9);
    const behind = box(0.42, 0.12, 0.6, 0.9);

    const frames = feed(new PersonTracker(), [
      [front, beside],
      [front, beside],
      [front, beside],
      [front, behind],
    ]);

    expect(frames.map((frame) => frame.count)).toEqual([0, 2, 2, 1]);
    expect(frames[3].tracks.map((track) => track.id)).toEqual([1]);
  });

  it('starts over after reset', () => {
    const tracker = new PersonTracker();
    feed(tracker, [[body], [body], [body]]);
    tracker.reset();
    const next = tracker.push([body]);
    expect(next.count).toBe(0);
    expect(next.stable).toBe(false);
  });
});
