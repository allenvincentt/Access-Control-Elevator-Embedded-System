# Person detection baseline

Phase 0 of the human-detection improvement plan: every later change to `src/services/person/*` is judged against the numbers on this page, not by eye.

The failure that matters is an **undercount**. The firmware releases the car when the reported count equals the number of verified riders, so a count one short on a tailgating clip lets a tailgater ride. Overcounts and unsettled clips block the ride, which fails safe.

## Workflow

### 1. Unit tests

```bash
npm test
```

Covers `suppressDuplicates`, `acceptedBy`, `PersonTracker` and the replay metrics with synthetic boxes. Tests named *current behaviour, Phase N target* pin a known flaw on purpose. When the phase that fixes the flaw lands, the test fails, and its assertion is flipped as part of that change.

### 2. Record clips

Dataset capture appears only in dev builds, or in a release build bundled with `EXPO_PUBLIC_PERSON_DATASET=1`. Record in a release build when timing matters, because a dev build runs the JS pixel loop slower and spaces frames further apart.

```powershell
$env:EXPO_PUBLIC_PERSON_DATASET='1'; npx expo run:android --variant release
```

1. Open the human detector and tap **Dataset** in the panel header.
2. Set **People really in view** to the true count and tick every scenario tag that applies.
3. Tap **Record clip**, let the scene play out for 5–10 s, and tap **Stop**.

While recording, frames are captured at the counting cadence (`pollIntervalMs`), even when the controller isn't in the counting phase. Each frame is the exact JPEG the live pipeline saw. The clip is stored on the phone under `Documents/person-dataset/<clip-id>/`, with a `clip.json` sidecar holding the label plus each frame's size and capture time. Clips contain images of real people, so they are never committed.

To copy the dataset off a debug build:

```bash
adb exec-out run-as com.anonymous.elevatorsystemmobileapp tar c files/person-dataset > person-dataset.tar
```

### 3. Replay

Tap **Replay** in the dataset panel, then **Run replay**. Every clip is fed through the real `detectPeople` → `PersonTracker` code, with the current model and constants, and a fresh tracker per clip. The report is:

- printed to the Metro console,
- saved on the phone as `Documents/person-dataset/report-<timestamp>.md`,
- shareable from **Share report**.

Paste the report into **Baseline results** below whenever the baseline is re-recorded.

## Recording checklist

| Scenario | Tag | Clips |
| --- | --- | --- |
| Empty scene, 1, 2, 3, 4 and max-capacity riders | *(label count only)* | ≥ 2 each |
| A person partly hidden behind another | Partly hidden | ≥ 3 |
| A child in front of an adult | Child in front | ≥ 3 |
| A child carried in arms | Carried child | ≥ 3 |
| Someone standing right next to the camera | Near camera | ≥ 2 |
| A wheelchair user or seated person | Seated | ≥ 2 |
| Bags, coats or a trolley with no extra person | Bags or trolley | ≥ 3 |
| Bright, dim and backlit lighting | Bright / Dim / Backlit | ≥ 2 each |
| Mirror or steel wall reflections | Reflection | ≥ 2 |

The demo runs with real people in a taped floor area outside the miniature car, so there is no physical door; the plan's door open/closed split does not apply.

## Metrics

| Metric | Definition |
| --- | --- |
| Final count | The count on the last frame the tracker marked stable. A clip with no stable frame is *unsettled*. |
| Count accuracy | Share of clips whose final count equals the label. |
| **Undercount rate** | Share of clips whose final count is below the label. The key metric. |
| Overcount rate | Share of clips whose final count is above the label. |
| Never settled | Share of clips that never produced a stable count. |
| Stable undercount at any point | Share of clips that held a stable count below the label on any frame, even if the clip ended correct. This is a moment when the firmware could have seen a matching streak for a smaller group. |
| Time to correct stable count | From the clip's first frame to the first stable frame showing the true count, in capture time. Compare against the 9 s `OCCUPANCY_WAIT_MS`. |
| Gate / merged / in view | Mean per-frame `DetectionStats.decoded`, `merged` and `accepted`. |
| Top score | Mean best person score per frame, before thresholds. |
| Detect | Mean `detectPeople` time per frame during replay. |

Results are broken down overall, by rider count and by scenario tag.

## Baseline results

**Not recorded yet.** Record the checklist above with the current model (SSD MobileNet V1 quant, 300×300) and constants, run the replay, and paste the report here.

| Field | Value |
| --- | --- |
| Date | — |
| Commit | — |
| Phone | — |
| Build | dev / release |
| Clips / frames | — |
