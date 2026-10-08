import { OVERHEAD_TRACKING } from '@/services/overhead/constants';
import { iou, type Box, type Detection } from '@/services/overhead/geometry';

export type TrackedPerson = {
  id: number;
  box: Box;
  score: number;
};

type Track = {
  id: number;
  box: Box;
  score: number;
  vx: number;
  vy: number;
  activated: boolean;
  lost: boolean;
  lastFrame: number;
};

type Pair = { track: number; detection: number; similarity: number };

function shift(box: Box, dx: number, dy: number): Box {
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}

function centre(box: Box) {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

export class ByteTracker {
  private tracks: Track[] = [];
  private frame = 0;
  private nextId = 1;

  reset() {
    this.tracks = [];
    this.frame = 0;
  }

  update(detections: Detection[]): TrackedPerson[] {
    this.frame += 1;
    const used = new Set<number>();

    const active = this.tracks.filter((track) => track.activated);
    const unconfirmed = this.tracks.filter((track) => !track.activated);

    const matchedActive = this.associate(active, detections, used, OVERHEAD_TRACKING.matchThreshold);
    const matchedUnconfirmed = this.associate(
      unconfirmed,
      detections,
      used,
      OVERHEAD_TRACKING.unconfirmedMatchThreshold,
    );

    for (const track of active) {
      if (!matchedActive.has(track)) track.lost = true;
    }
    for (const track of unconfirmed) {
      if (matchedUnconfirmed.has(track)) {
        track.activated = true;
        track.id = this.nextId;
        this.nextId += 1;
      }
    }

    const fresh: Track[] = [];
    detections.forEach((detection, index) => {
      if (used.has(index) || detection.score < OVERHEAD_TRACKING.newTrackScore) return;
      const first = this.frame === 1;
      fresh.push({
        id: first ? this.nextId : 0,
        box: { left: detection.left, top: detection.top, right: detection.right, bottom: detection.bottom },
        score: detection.score,
        vx: 0,
        vy: 0,
        activated: first,
        lost: false,
        lastFrame: this.frame,
      });
      if (first) this.nextId += 1;
    });

    this.tracks = [
      ...active.filter(
        (track) => !track.lost || this.frame - track.lastFrame <= OVERHEAD_TRACKING.lostBufferFrames,
      ),
      ...unconfirmed.filter((track) => matchedUnconfirmed.has(track)),
      ...fresh,
    ];
    this.dropDuplicates();

    return this.tracks
      .filter((track) => track.activated && !track.lost)
      .map((track) => ({ id: track.id, box: track.box, score: track.score }));
  }

  private predicted(track: Track): Box {
    const gap = this.frame - track.lastFrame;
    return shift(track.box, track.vx * gap, track.vy * gap);
  }

  private associate(tracks: Track[], detections: Detection[], used: Set<number>, threshold: number) {
    const pairs: Pair[] = [];
    tracks.forEach((track, trackIndex) => {
      const guess = this.predicted(track);
      detections.forEach((detection, detectionIndex) => {
        if (used.has(detectionIndex)) return;
        const similarity = iou(guess, detection) * detection.score;
        if (1 - similarity <= threshold) pairs.push({ track: trackIndex, detection: detectionIndex, similarity });
      });
    });
    pairs.sort((a, b) => b.similarity - a.similarity);

    const matched = new Set<Track>();
    for (const pair of pairs) {
      const track = tracks[pair.track];
      if (matched.has(track) || used.has(pair.detection)) continue;
      matched.add(track);
      used.add(pair.detection);
      this.apply(track, detections[pair.detection]);
    }
    return matched;
  }

  private apply(track: Track, detection: Detection) {
    const gap = Math.max(1, this.frame - track.lastFrame);
    const before = centre(track.box);
    const box = { left: detection.left, top: detection.top, right: detection.right, bottom: detection.bottom };
    const after = centre(box);
    const gain = OVERHEAD_TRACKING.velocityGain;
    track.vx = track.vx * (1 - gain) + ((after.x - before.x) / gap) * gain;
    track.vy = track.vy * (1 - gain) + ((after.y - before.y) / gap) * gain;
    track.box = box;
    track.score = detection.score;
    track.lost = false;
    track.lastFrame = this.frame;
  }

  private dropDuplicates() {
    const live = this.tracks.filter((track) => track.activated && !track.lost);
    const lost = this.tracks.filter((track) => track.activated && track.lost);
    const doomed = new Set<Track>();
    for (const a of live) {
      for (const b of lost) {
        if (iou(a.box, this.predicted(b)) < OVERHEAD_TRACKING.duplicateIou) continue;
        doomed.add(b);
      }
    }
    if (doomed.size > 0) this.tracks = this.tracks.filter((track) => !doomed.has(track));
  }
}
