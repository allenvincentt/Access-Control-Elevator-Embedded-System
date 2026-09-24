# Training the head detector

The stock YOLO model counts **bodies**. From above, two people standing close together look like
one body, and people bending over are often missed. **Heads** stay separate even when people
touch, so this guide trains a model that finds heads, using photos from your own camera spot.

You will:

1. Record videos from the camera spot
2. Turn the videos into photos
3. Draw a box around every head (labeling)
4. Train in Colab
5. Put the model in the app
6. Test, and improve if needed

Plan on about **3–4 hours** total, most of it labeling.

---

## Part 1: Record

**Set up exactly like the demo.** The model learns what heads look like *from that spot*, so:

- Mount the phone **where it will be during the demo**, at the same height and angle
- Hold it in **landscape**, the same way the app runs
- Use the normal camera app in video mode (1080p is fine)
- **Keep the phone still.** Don't hold it in your hand

**What to record.** About 30 seconds of each, with 2–4 friends:

| # | Scene |
|---|---|
| 1 | Nobody there, just the floor (for about 15 seconds) |
| 2 | One person standing, turning around, walking in and out |
| 3 | One person bending over, crouching, tying a shoe |
| 4 | Two people standing apart |
| 5 | Two people **shoulder to shoulder** |
| 6 | Two people **hugging, or one leaning on the other** |
| 7 | One standing and one bending right next to them |
| 8 | Three people, mixed poses, close together |
| 9 | Three or four people all bending |
| 10 | Someone wearing a **cap or hood**; someone carrying a bag |

**Do it twice or more**, on different days or at different times (different light and clothes).
That variety is what makes the model reliable. Aim for **5–10 minutes of video in total**.

Also record a short clip with **round dark things** on the floor (a bag, a ball, a helmet), with
nobody there. It teaches the model that those aren't heads.

---

## Part 2: Turn the videos into photos

1. Go to **drive.google.com**. Make a folder **`elevator-head-detector`**, and inside it a
   folder **`videos`**. Upload your recordings there. (Copy them from the phone to the PC first.)
2. Open **colab.research.google.com**, then **File → Upload notebook**, and choose
   `training/head-detector/train_head_detector.ipynb` from this repo.
3. Run **Step 0**, **Step 1** and **Step 2**, reading the text above each one.
4. In Drive, download **`elevator-head-detector/frames.zip`**.

You should have about **400–800 photos**. If you have far more, raise `EVERY_SECONDS` to 1.0 and
run Step 2 again. Labeling time grows with every photo.

---

## Part 3: Label the heads in Roboflow

Roboflow is a free website for drawing boxes on photos.

### Set up the project

1. Sign up at **roboflow.com** (free plan).
2. **Create New Project**, then:
   - Project type: **Object Detection**
   - Project name: **`elevator-heads`**
   - What are you detecting: **`head`**
3. **Upload** `frames.zip`, then **Save and Continue**, then **Manual labeling**, and assign the
   photos to yourself.

### How to draw boxes

Open a photo, press **B** (box tool), and drag a box around each head. Pick the class `head`.

**The rules. Be consistent, because the model copies whatever you do:**

- **Box the head only.** From above that's the hair and the top of the head, down to where the
  neck starts. Not the shoulders.
- **Keep it tight.** The box edges should touch the edge of the hair.
- **Every visible head gets a box**, even when it's partly hidden behind someone, as long as you
  can tell it's a head.
- **Caps, hoods and helmets count as the head.** Box the hat.
- **A head cut off at the edge of the photo:** box it if at least half is visible.
- **Nobody in the photo:** don't draw anything, and mark it done. Empty photos are useful, so
  keep them. About 1 in 10 photos should be empty.
- **Very blurry photo** where you can't tell what's a head: delete it.

Tips: press **Enter** to go to the next photo. Roboflow's "Label Assist" can suggest boxes once
you've done about 50 by hand; always check its suggestions.

### Make a dataset version

When every photo is done:

1. **Generate → New Version**
2. **Train/Test Split:** 70% train, 20% valid, 10% test
3. **Preprocessing:** keep **Auto-Orient** only. Remove Resize.
4. **Augmentation:** **none** (the notebook does its own)
5. **Create**

Look at your browser's address bar. It will be `app.roboflow.com/<WORKSPACE>/elevator-heads/<VERSION>`.
Write down the **workspace** and the **version number**.

Get your key: **Settings → API Keys → Private API Key → copy**.

---

## Part 4: Train

Back in the Colab notebook:

1. Put your Roboflow key in Colab's **Secrets** (the key icon on the left) as
   `ROBOFLOW_API_KEY`, with **Notebook access** on.
2. **Step 4, Option A:** fill in `WORKSPACE` and `VERSION`, then run it.
3. **Step 5:** check the output. Fix anything marked **WARNING**.
4. **Step 6:** train. It takes about 20–60 minutes. Leave the tab open.
5. **Step 7:** note the results. The line to care about is **under**, how often it counts too
   few people. You want it **below 5%**. Write down the **suggested minScore**.
6. **Step 8:** export. `person-detector.tflite` downloads.
7. **Step 9:** checks the exported file the way the phone uses it. Its numbers should be close
   to Step 7.

**If Colab disconnects during training:** reconnect, run Steps 0, 1, 4 and 5 again, then run the
**Resume** cell, not Step 6.

---

## Part 5: Put it in the app

1. In `src/assets/models/`, rename the current `person-detector.tflite` to
   `person-detector-body-backup.tflite`.
2. Copy the new `person-detector.tflite` from Downloads into `src/assets/models/`.
3. Check it:
   ```bash
   npm run verify-person-model
   ```
   It must say **`path:  yolo (head detector), 1 class(es)`** and **`PASS`**.
4. Open `src/services/person/constants.ts`, find `PERSON_SCOPE_HEAD`, and set `minScore` to the
   value Step 7 suggested.
5. Rebuild:
   ```bash
   npx expo run:android --variant release
   ```

On the phone, the bottom-left line should start with **`yolo head`**, and the boxes should now
sit on heads.

**To switch back** to the body model: rename the backup to `person-detector.tflite` and rebuild.

---

## Part 6: Test, and improve

Mount the phone in the demo spot and try every scene from Part 1. For each one, check that the
count is right and stays steady.

**If a scene fails**, that's the model telling you it hasn't seen enough of that scene:

1. Record 1–2 more minutes of **that scene**
2. Put the new video in the Drive `videos` folder and run Step 2 again. In the Drive `frames`
   folder, the new photos' names start with the new video's name. Upload only those to the same
   Roboflow project, because Roboflow skips duplicates but it's slower
3. Label them, and generate a **new version** (the version number goes up)
4. In the notebook, change `VERSION`, then run Steps 4 → 9 again

Two or three rounds of this usually fixes the hard cases.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Step 0 says `command not found` | GPU not on: Runtime → Change runtime type → T4 GPU |
| Step 4 says the key is missing | Secret must be named exactly `ROBOFLOW_API_KEY`, with Notebook access on |
| Step 5 warns "no empty photos" | Label a few photos of the empty floor and make a new version |
| Step 5 says heads are smaller than the app minimum | Tell Claude the numbers; the app's head size limits need lowering |
| Step 7 **under** is above 5% | Record and label more of the scenes it fails on (Part 6) |
| Verifier says `person detector, class 0` | You exported the wrong model; use `runs/head/weights/best.pt` (Step 8 does this) |
| App shows `yolo head` but counts 0 | Lower `PERSON_SCOPE_HEAD.minScore` by 0.1 and rebuild, then tell Claude |
| Boxes trail behind people | The phone is moving. Mount it still |
