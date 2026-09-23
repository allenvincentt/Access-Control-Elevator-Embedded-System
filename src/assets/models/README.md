# Bundled TFLite models

Two models ship in the APK. Each screen loads only the one it needs, so a device
running the 2FA terminal never loads the detector and vice versa.

| File | Used by | Loader |
| --- | --- | --- |
| `mobilefacenet.tflite` | `FacialRecognitionScreen`, `FaceEnrollmentScreen` | `src/services/face/embedder.ts` |
| `person-detector.tflite` | `HumanDetectionScreen` | `src/services/person/model.ts` |

Both are resolved through `Asset.fromModule(require(...))`, so `tflite` must stay
listed in `assetExts` in `metro.config.js`. A release build embeds the model in the
APK — replacing a file requires a full rebuild, reloading Metro is not enough.

## MobileFaceNet

`mobilefacenet.tflite` in this folder is a **placeholder**. Replace it with a real
MobileFaceNet TensorFlow Lite model before face enrollment or verification will work.

Required model contract (enforced at runtime by `src/services/face/embedder.ts`):

| Property | Value |
| --- | --- |
| Input shape | `1 x 112 x 112 x 3`, float32, NHWC, RGB |
| Input normalisation | `(pixel - 127.5) / 128.0` (applied by the app) |
| Output shape | `1 x 192` float32 embedding |

The app L2-normalises the output, so the model does not have to.

Check a candidate model against this contract before rebuilding:

```
npm run verify-face-model -- path/to/model.tflite
```

Run with no argument to check the file currently in this folder. The model must not be
quantised — the app feeds TFLite a float32 tensor, so a uint8/int8 build will not work.

If your model emits a different number of dimensions, change all three of:

1. `FACE_EMBEDDING_SIZE` in `src/services/face/constants.ts`
2. the `extensions.vector(...)` column in `supabase/migrations/0004_biometrics_and_logs.sql`
3. `embedding_dimensions` in the `public.app_config` row

and re-enrol every staff member, because templates from different models are not comparable.

## Person detector

`person-detector.tflite` is **SSD MobileNet V1 (COCO), 300x300 quantised** — the `detect.tflite`
from Google's `coco_ssd_mobilenet_v1_1.0_quant_2018_06_29.zip`, renamed. Verify it with:

```
npm run verify-person-model
```

The app accepts two kinds of model and picks the path from the file's outputs, with no
setting to change. The verifier prints which path a file will take.

| Path | Recognised by | Counts | Scopes |
| --- | --- | --- | --- |
| `ssd` | four outputs from `TFLite_Detection_PostProcess` | whole or partial bodies | `PERSON_SCOPES` |
| `yolo`, one class | a single `[1, 5, N]` output | heads, seen overhead | `PERSON_SCOPE_HEAD` |
| `yolo`, many classes | a single `[1, 4+classes, N]` output, e.g. stock COCO `yolo11n` | whole or partial bodies (class `0`) | `PERSON_SCOPES` |

A stock COCO YOLO works untrained: `yolo export model=yolo11n.pt format=tflite imgsz=320`,
then use the `_float16.tflite` file.

Everything after decoding is shared: duplicate merging, group-box removal, scope gating,
tracking, confirmation and reporting behave the same on both paths.

**Raw-anchor exports do not work** — MediaPipe's EfficientDet-Lite0, for example, emits
`[1, 19206, 90]` logits and `[1, 19206, 4]` box regressions and expects the caller to decode
anchors, which this app does not do. The verifier catches that.

### YOLO head detector

Train an Ultralytics YOLO (YOLO11n or YOLOv8n) on overhead frames with heads labelled, and
export it with `yolo export model=best.pt format=tflite imgsz=320` (add `int8=True` for
int8 weights). Start with the `_float16.tflite` file. Whichever file you pick, run the
verifier on it first: the output must be float32. A fully integer-quantised export has int8
outputs, which the app cannot dequantise, and is rejected at load. Rename the chosen file to
`person-detector.tflite` and rebuild.

| Property | Value |
| --- | --- |
| Input shape | `1 x S x S x 3`, square, NHWC, RGB |
| Input type | `float32` (`pixel / 255`), or `uint8` / `int8` |
| Output | one float32 `[1, 4+classes, N]` tensor, box as `cx, cy, w, h` |
| Box units | normalised or input pixels, detected per box |
| Head class | channel `4 + HEAD_CLASS_INDEX` (`0` for a single-class model) |

The raw candidates go through `nonMaxSuppression` at `yoloNmsIouThreshold` before the shared
merge. `PERSON_SCOPE_HEAD` sets the head size, shape and confidence gates; retune it against
real frames from the rig, since head size depends on camera height.

### SSD person detector

Required model contract (enforced at load by `src/services/person/model.ts`):

| Property | Value |
| --- | --- |
| Input shape | `1 x S x S x 3`, square, NHWC, RGB |
| Input type | `uint8` (raw bytes) or `float32` (`(pixel - 127.5) / 127.5`) |
| Outputs | one `[1, N, 4]` box tensor, two `[1, N]` tensors, one scalar count |
| Box order | `ymin, xmin, ymax, xmax`, normalised to the input square |
| Person class | index `0` in the COCO label map |

The loader reads the input size off the model, so a 300x300 and a 320x320 export both
work with no code change. It identifies the four outputs by shape, and works out which of
the two `[1, N]` tensors is scores and which is classes from their values, so export
ordering does not matter. That test runs on every frame rather than being remembered from
the first one: a score is a confidence in `[0, 1]` while a class index is a whole number
that routinely exceeds 1, and a frame where both tensors look alike (an empty car makes
both all zeros) carries no evidence either way. Deciding once from an ambiguous frame
risks settling on the wrong answer permanently, which reads every class index as a
"confidence" that clears any threshold and reports doors, chairs and walls as people.

`TFLite_Detection_PostProcess` produces **dynamically shaped** outputs, so the four output
shapes are empty in the file and only resolve once the interpreter allocates tensors. When
the loader sees four outputs it cannot identify by shape, it falls back to the conventional
order — boxes 0, classes 1, scores 2, count 3.

If your model uses a different label map, change `PERSON_CLASS_INDEX` in
`src/services/person/constants.ts`. Frames are letterboxed to preserve aspect ratio, and
the padding is undone when boxes are mapped back, so wide and tall previews both work.

### Counting behaviour

`TFLite_Detection_PostProcess` in this export is baked at `nms_iou_threshold` 0.6 and
`nms_score_threshold` 1e-8. It therefore keeps any box overlapping a stronger one by less
than 60%, and filters on confidence not at all — every gate that matters lives in the app.
Somebody standing sideways produces a torso box and a whole-body box overlapping by
roughly 40-55%, and raising an arm adds a third, so without app-side suppression one
person arrives downstream as several detections and each becomes its own track.

`suppressDuplicates` in `detector.ts` closes that, on two measures: intersection over
union, and intersection over the smaller box, which is what catches a part nested inside a
whole (a torso inside a body scores about 0.35 IoU but 1.0 nested). `PersonTracker` then
requires `trackConfirmFrames` consecutive frames before a box counts, so a single-frame
false positive cannot move the number.

Two things are worth knowing before touching the numbers.

Box coordinates are **fractions of the frame, not pixels**, so a height/width
ratio taken straight from them carries the frame's own shape. The camera locks to
landscape, which stretches that ratio by the frame aspect: a person who is about
4:1 in pixels reads as roughly 7:1 in frame fractions. `minAspect` and
`maxAspect` are specified in pixels and the detector divides the frame aspect
back out before comparing. A ceiling set against the raw fraction ratio rejects
nearly every standing person.

`PERSON_DETECTION.showDiagnostics` draws the per-stage counts over the camera:

```
model 10/10   gate 3   merged 1   in view 1   counted 1
best person score 0.78 · needs 0.40
```

Read it left to right to find the stage that dropped somebody. `model` is what
the post-process returned, `gate` what cleared the loosest score and size, and
`in view` what a scope accepted. If `gate` is 0 while `best person score` sits
just under the threshold, lower `minScore`; if `gate` is healthy but `in view` is
0, the size, shape or region gates are doing it. Turn it off once the car is
dialled in.

The knobs, all in `src/services/person/constants.ts`:

| Symptom | Knob | Direction |
| --- | --- | --- |
| One person counted more than once | `nmsIouThreshold`, `containmentThreshold` | lower |
| Two people standing close counted as one | `containmentThreshold`, `trackOverlapThreshold` | raise |
| Furniture or fittings counted as people | `minScore` on both scopes | raise |
| Someone at the back of the car missed | `minBoxHeight`, `minScore` on `PERSON_SCOPE_OVERHEAD` | lower |
| Two people side by side read as nobody (one box around both) | `groupSplitOverlap`, `groupMemberMinShare` | raise / lower |
| A bending rider opens a second box | `trackCentreMatch` | raise |
| A rider drops out when their score dips | `sustainScore` on the active scope | lower |
| A moving head opens a second track | `trackCentreFloor`, `trackCentreMatch` | raise |
| Count takes too long to settle | `trackConfirmFrames`, `stableFrames` | lower |
| Count flickers while people move | `trackCountGrace`, `stableFrames` | raise |

Confidence is the only lever that separates a person from an upright, person-sized object,
so a fitting that scores above `minScore` on frame after frame cannot be tuned out here.
That is a limit of SSD MobileNet V1 quant, which is a weak detector; if it shows up in a
real car, swap in an SSD MobileNet V2 or EfficientDet-Lite export rather than pushing
`minScore` high enough to start losing people in poor light.

No Python is needed for either model as long as you use a pre-converted export.
