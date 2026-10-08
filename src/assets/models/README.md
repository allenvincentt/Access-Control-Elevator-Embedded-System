# Bundled TFLite models

Two models ship in the APK. Each screen loads only the one it needs, so a device
running the 2FA terminal never loads the detector and vice versa.

| File                     | Used by                                           | Loader                          |
| ------------------------ | ------------------------------------------------- | ------------------------------- |
| `mobilefacenet.tflite`   | `FacialRecognitionScreen`, `FaceEnrollmentScreen` | `src/services/face/embedder.ts` |
| `person-detector.tflite` | `HumanDetectionScreen`                            | `src/services/overhead/model.ts` |

Both are resolved through `Asset.fromModule(require(...))`, so `tflite` must stay
listed in `assetExts` in `metro.config.js`. A release build embeds the model in the
APK — replacing a file requires a full rebuild, reloading Metro is not enough.

## MobileFaceNet

`mobilefacenet.tflite` in this folder is a **placeholder**. Replace it with a real
MobileFaceNet TensorFlow Lite model before face enrollment or verification will work.

| Property            | Value                                          |
| ------------------- | ---------------------------------------------- |
| Input shape         | `1 x 112 x 112 x 3`, float32, NHWC, RGB        |
| Input normalisation | `(pixel - 127.5) / 128.0` (applied by the app) |
| Output shape        | `1 x 192` float32 embedding                    |

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

`person-detector.tflite` is the **top-view YOLO11n** person model from the `HumanDetectionModel`
repo, exported to TFLite (float32, 640x640). It was fine-tuned on 3,137 overhead images, so it
finds people seen from directly above and ignores front and side views. Source and credits:
Zenodo record 15731095 (CC BY 4.0).

Verify it with:

```
npm run verify-person-model
```

| Property    | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| Input       | `1 x 640 x 640 x 3` (or `1 x 3 x S x S`), square, **float32**      |
| Output      | one **float32** `[1, 5, 8400]` tensor: `cx, cy, w, h, score`       |
| Classes     | 1 (person). A multi-class COCO YOLO also loads; class `0` is used |

### Pipeline

Everything lives in `src/services/overhead/` and mirrors `app.py` in `HumanDetectionModel`, so
the phone shows the same numbers as the laptop.

| Step      | File          | What it does                                                                  |
| --------- | ------------- | ----------------------------------------------------------------------------- |
| Load      | `model.ts`    | Loads the model, checks the input and output contract                         |
| Detect    | `detector.ts` | Letterbox with gray (114) padding, decode, score >= 0.35, NMS at IoU 0.65     |
| Track     | `tracker.ts`  | ByteTrack-style IDs; a lost person keeps the same ID for up to 30 frames      |
| Count     | `counter.ts`  | People = median of the last 9 frames; Unique = IDs seen for 5+ frames; steady |

The gray padding matters: with black padding the model reports a person in an empty car.

### On screen

| Element        | Meaning                                                     |
| -------------- | ----------------------------------------------------------- |
| Box + `#id 0.87` | One tracked person, its ID and confidence. Color follows the ID |
| Dot            | Centre of the person                                        |
| People         | Smoothed count. This is what is sent to the controller      |
| Raw            | People detected in this frame                               |
| Unique         | Different people seen since the screen opened              |
| FPS            | Detection frames per second                                 |

### Knobs (`src/services/overhead/constants.ts`)

| Symptom                                  | Knob                                    | Direction |
| ---------------------------------------- | --------------------------------------- | --------- |
| People missed                            | `OVERHEAD_DETECTION.confidence`         | lower     |
| Objects counted as people                | `OVERHEAD_DETECTION.confidence`         | raise     |
| Two people standing close counted as one | `OVERHEAD_DETECTION.nmsIou`             | raise     |
| One person counted twice                 | `OVERHEAD_DETECTION.nmsIou`             | lower     |
| Count flickers                           | `OVERHEAD_COUNTING.smoothWindow`        | raise     |
| Count reacts too slowly                  | `OVERHEAD_COUNTING.smoothWindow`        | lower     |
| A person gets a new ID after a short miss | `OVERHEAD_TRACKING.lostBufferFrames`   | raise     |

### Updating the model

In `HumanDetectionModel`, export ONNX, convert with `onnx2tf`, and copy the
`*_float32.tflite` file here as `person-detector.tflite`. Check it with
`python verify_tflite.py <file>` there and `npm run verify-person-model` here, then rebuild.
The float16 file from `onnx2tf` has float16 input and output and is rejected.
