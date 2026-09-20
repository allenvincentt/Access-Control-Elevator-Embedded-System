import { PERSON_DETECTION } from '@/services/person/constants';
import type { PersonBox } from '@/services/person/detector';
import { intersectionOverSmaller, intersectionOverUnion } from '@/services/person/geometry';

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

type Pairing = {
  track: number;
  candidate: number;
  overlap: number;
};

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

    const matchedTracks = new Set<number>();
    const matchedCandidates = new Set<number>();

    // Every track/candidate pair is scored first and the best ones are taken in
    // order. Walking the tracks one at a time and letting each keep its first
    // acceptable candidate lets whichever track happens to come first claim a box
    // that belongs to another, which strands the rightful track and spawns a
    // duplicate for the box it should have kept.
    const pairings: Pairing[] = [];
    for (let track = 0; track < this.tracks.length; track += 1) {
      for (let candidate = 0; candidate < candidates.length; candidate += 1) {
        const overlap = intersectionOverUnion(this.tracks[track].box, candidates[candidate]);
        if (overlap >= PERSON_DETECTION.iouMatchThreshold) {
          pairings.push({ track, candidate, overlap });
        }
      }
    }
    pairings.sort((a, b) => b.overlap - a.overlap);

    for (const pairing of pairings) {
      if (matchedTracks.has(pairing.track)) continue;
      if (matchedCandidates.has(pairing.candidate)) continue;

      matchedTracks.add(pairing.track);
      matchedCandidates.add(pairing.candidate);

      const track = this.tracks[pairing.track];
      track.box = candidates[pairing.candidate];
      track.hits += 1;
      track.misses = 0;
      track.confirmed = track.hits >= PERSON_DETECTION.trackConfirmFrames;
    }

    for (let track = 0; track < this.tracks.length; track += 1) {
      if (!matchedTracks.has(track)) this.tracks[track].misses += 1;
    }

    this.tracks = this.tracks.filter((track) => track.misses <= PERSON_DETECTION.trackMissLimit);

    for (let index = 0; index < candidates.length; index += 1) {
      if (matchedCandidates.has(index)) continue;
      const candidate = candidates[index];

      // A box sitting largely inside a track that is already live is another view
      // of that same person, not a new one. Matching on union alone misses this:
      // a torso box nested in a whole-body box scores well below the match
      // threshold, so without this check a person turning sideways opens a second
      // track while the first is still running.
      const fragment = this.tracks.some(
        (track) =>
          intersectionOverSmaller(track.box, candidate) >= PERSON_DETECTION.trackOverlapThreshold,
      );
      if (fragment) continue;

      this.tracks.push({
        id: this.nextId,
        box: candidate,
        hits: 1,
        misses: 0,
        confirmed: PERSON_DETECTION.trackConfirmFrames <= 1,
      });
      this.nextId += 1;
    }

    this.collapseOverlapping();

    // A track counts once it has been seen on trackConfirmFrames frames in a row,
    // which is what keeps a single-frame flicker on a door or a chair from moving
    // the number. The grace on misses is the other half of it: dropping a track
    // the instant one frame fails to find it made the count sag and recover
    // constantly while somebody moved, so it never settled.
    const counted = this.tracks.filter(
      (track) => track.confirmed && track.misses <= PERSON_DETECTION.trackCountGrace,
    );
    const count = counted.length;

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
      tracks: counted,
    };
  }

  /**
   * Drops a track that has drifted onto the same person as a longer-lived one.
   * Frame-level suppression cannot catch this on its own, because a split that
   * alternates between frames leaves two tracks that are each valid in isolation.
   *
   * The trade-off is that somebody standing directly behind another person, close
   * enough for their visible box to be mostly covered, merges into one. Raise
   * trackOverlapThreshold if a car is deep enough for that to be the common case.
   */
  private collapseOverlapping() {
    const ordered = [...this.tracks].sort((a, b) => b.hits - a.hits || a.id - b.id);
    const survivors: PersonTrack[] = [];

    for (const track of ordered) {
      const duplicate = survivors.some(
        (kept) =>
          intersectionOverSmaller(kept.box, track.box) >= PERSON_DETECTION.trackOverlapThreshold,
      );
      if (!duplicate) survivors.push(track);
    }

    if (survivors.length !== this.tracks.length) {
      this.tracks = survivors.sort((a, b) => a.id - b.id);
    }
  }
}
