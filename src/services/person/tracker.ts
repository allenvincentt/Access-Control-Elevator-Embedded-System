import { PERSON_DETECTION } from '@/services/person/constants';
import type { PersonBox } from '@/services/person/detector';

export type PersonTrack = {
  id: number;
  box: PersonBox;
  hits: number;
  misses: number;
  confirmed: boolean;
};

export type TrackedCount = {
  count: number;
  stable: boolean;
  progress: number;
  tracks: PersonTrack[];
};

function intersectionOverUnion(a: PersonBox, b: PersonBox): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);

  if (right <= left || bottom <= top) return 0;

  const overlap = (right - left) * (bottom - top);
  const areaA = Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
  const areaB = Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const union = areaA + areaB - overlap;
  return union > 0 ? overlap / union : 0;
}

export class PersonTracker {
  private tracks: PersonTrack[] = [];
  private nextId = 1;
  private lastCount = -1;
  private steadyFrames = 0;

  reset() {
    this.tracks = [];
    this.lastCount = -1;
    this.steadyFrames = 0;
  }

  push(boxes: PersonBox[]): TrackedCount {
    const candidates = boxes.filter((box) => box.inRoi);
    const taken = new Set<number>();

    for (const track of this.tracks) {
      let best = -1;
      let bestScore: number = PERSON_DETECTION.iouMatchThreshold;

      for (let index = 0; index < candidates.length; index += 1) {
        if (taken.has(index)) continue;
        const score = intersectionOverUnion(track.box, candidates[index]);
        if (score >= bestScore) {
          bestScore = score;
          best = index;
        }
      }

      if (best >= 0) {
        taken.add(best);
        track.box = candidates[best];
        track.hits += 1;
        track.misses = 0;
        track.confirmed = track.hits >= PERSON_DETECTION.trackConfirmFrames;
      } else {
        track.misses += 1;
      }
    }

    this.tracks = this.tracks.filter((track) => track.misses <= PERSON_DETECTION.trackMissLimit);

    for (let index = 0; index < candidates.length; index += 1) {
      if (taken.has(index)) continue;
      this.tracks.push({
        id: this.nextId,
        box: candidates[index],
        hits: 1,
        misses: 0,
        confirmed: PERSON_DETECTION.trackConfirmFrames <= 1,
      });
      this.nextId += 1;
    }

    const count = this.tracks.filter((track) => track.confirmed && track.misses === 0).length;

    if (count === this.lastCount) {
      this.steadyFrames = Math.min(PERSON_DETECTION.stableFrames, this.steadyFrames + 1);
    } else {
      this.lastCount = count;
      this.steadyFrames = 1;
    }

    return {
      count,
      stable: this.steadyFrames >= PERSON_DETECTION.stableFrames,
      progress: Math.min(1, this.steadyFrames / PERSON_DETECTION.stableFrames),
      tracks: this.tracks.filter((track) => track.misses === 0),
    };
  }
}
