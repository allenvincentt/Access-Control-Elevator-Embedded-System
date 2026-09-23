import {
  PERSON_DETECTION,
  PERSON_ROI_WIDE,
  PERSON_SCOPES,
} from '@/services/person/constants';
import { clipFrameUri, type StoredClip } from '@/services/person/dataset';
import { detectPeople, resetRoleResolution } from '@/services/person/detector';
import {
  buildReport,
  scoreClip,
  type ClipScore,
  type ReplayFrame,
  type ReplayReport,
} from '@/services/person/metrics';
import { loadPersonModel } from '@/services/person/model';
import { PersonTracker } from '@/services/person/tracker';

export type ReplayProgress = {
  clip: number;
  clips: number;
  frame: number;
  frames: number;
};

export async function replayClip(
  clip: StoredClip,
  onFrame?: (frame: number, frames: number) => void,
  isCancelled?: () => boolean,
): Promise<ReplayFrame[]> {
  resetRoleResolution();
  const tracker = new PersonTracker();
  const frames = clip.manifest.frames;
  const results: ReplayFrame[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    if (isCancelled?.()) break;
    const frame = frames[index];
    const started = Date.now();
    const outcome = await detectPeople(
      { uri: clipFrameUri(clip, frame), width: frame.width, height: frame.height },
      PERSON_ROI_WIDE,
      PERSON_SCOPES,
    );
    const detectMs = Date.now() - started;

    if (outcome.ok) {
      const tracked = tracker.push(outcome.boxes);
      results.push({
        capturedAt: frame.capturedAt,
        ok: true,
        count: tracked.count,
        stable: tracked.stable,
        stats: outcome.stats,
        detectMs,
      });
    } else {
      results.push({
        capturedAt: frame.capturedAt,
        ok: false,
        count: 0,
        stable: false,
        stats: null,
        detectMs,
      });
    }

    onFrame?.(index + 1, frames.length);
  }

  return results;
}

export async function replayDataset(
  clips: StoredClip[],
  onProgress?: (progress: ReplayProgress) => void,
  isCancelled?: () => boolean,
): Promise<ReplayReport> {
  const loaded = await loadPersonModel();
  const scores: ClipScore[] = [];

  for (let index = 0; index < clips.length; index += 1) {
    if (isCancelled?.()) break;
    const clip = clips[index];
    const frames = await replayClip(
      clip,
      (frame, total) =>
        onProgress?.({ clip: index + 1, clips: clips.length, frame, frames: total }),
      isCancelled,
    );
    if (isCancelled?.()) break;
    scores.push(scoreClip(clip.manifest, frames));
  }

  return buildReport({
    generatedAt: Date.now(),
    model: { inputSize: loaded.inputSize, quantized: loaded.quantized },
    config: { detection: PERSON_DETECTION, roi: PERSON_ROI_WIDE, scopes: PERSON_SCOPES },
    scores,
  });
}
