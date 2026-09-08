# MobileFaceNet model

`mobilefacenet.tflite` in this folder is a **placeholder**. Replace it with a real
MobileFaceNet TensorFlow Lite model before face enrollment or verification will work.

Required model contract (enforced at runtime by `src/services/face/embedder.ts`):

| Property | Value |
| --- | --- |
| Input shape | `1 x 112 x 112 x 3`, float32, NHWC, RGB |
| Input normalisation | `(pixel - 127.5) / 128.0` (applied by the app) |
| Output shape | `1 x 128` float32 embedding |

The app L2-normalises the output, so the model does not have to.

Check a candidate model against this contract before rebuilding:

```
npm run verify-face-model -- path/to/model.tflite
```

Run with no argument to check the file currently in this folder. The model must not be
quantised — the app feeds TFLite a float32 tensor, so a uint8/int8 build will not work.
Note that a release build embeds the model in the APK, so replacing the file requires a
full rebuild; reloading Metro is not enough.

If your model emits 192 or 512 dimensions instead of 128, change all three of:

1. `FACE_EMBEDDING_SIZE` in `src/services/face/constants.ts`
2. the `extensions.vector(128)` column in `supabase/migrations/0004_biometrics_and_logs.sql`
3. `embedding_dimensions` in the `public.app_config` row

and re-enrol every staff member, because templates from different models are not comparable.
