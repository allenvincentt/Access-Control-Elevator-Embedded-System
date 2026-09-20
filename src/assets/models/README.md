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

To swap it, use any TFLite detection export that keeps the `TFLite_Detection_PostProcess`
op in the graph. **Raw-anchor exports do not work** — MediaPipe's EfficientDet-Lite0, for
example, emits `[1, 19206, 90]` logits and `[1, 19206, 4]` box regressions and expects the
caller to decode anchors and run NMS, which this app does not do. The verifier catches that.

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
the two `[1, N]` tensors is scores and which is classes from their values on the first
frame that actually contains a detection, so export ordering does not matter.

`TFLite_Detection_PostProcess` produces **dynamically shaped** outputs, so the four output
shapes are empty in the file and only resolve once the interpreter allocates tensors. When
the loader sees four outputs it cannot identify by shape, it falls back to the conventional
order — boxes 0, classes 1, scores 2, count 3.

If your model uses a different label map, change `PERSON_CLASS_INDEX` in
`src/services/person/constants.ts`. Frames are letterboxed to preserve aspect ratio, and
the padding is undone when boxes are mapped back, so wide and tall previews both work.

No Python is needed for either model as long as you use a pre-converted export.
