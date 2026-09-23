import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ClipLabelEditor } from "@/components/scanner/ClipLabelEditor";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Card } from "@/components/ui/Card";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { colors, radius, spacing, typography } from "@/constants/themeColor";
import { errorMessage } from "@/lib/errors";
import type { ClipLabel } from "@/services/person/constants";
import {
  deleteClip,
  listClips,
  relabelClip,
  saveReport,
  type StoredClip,
} from "@/services/person/dataset";
import {
  clipTagLabel,
  formatPercent,
  formatReport,
  formatSeconds,
  outcomeLabel,
  type ClipOutcome,
  type ClipScore,
  type ReplayReport,
} from "@/services/person/metrics";
import { replayDataset, type ReplayProgress } from "@/services/person/replay";

export type PersonReplayScreenProps = {
  onExit: () => void;
};

const OUTCOME_TONE: Record<ClipOutcome, ChipTone> = {
  correct: "success",
  under: "danger",
  over: "gold",
  unsettled: "neutral",
};

const CONTENT_MAX_WIDTH = 760;

type ClipListing = {
  clips: StoredClip[];
  error: string | null;
};

function readClips(): ClipListing {
  try {
    return { clips: listClips(), error: null };
  } catch (error) {
    return {
      clips: [],
      error: errorMessage(error, "The saved clips could not be read."),
    };
  }
}

export function PersonReplayScreen({ onExit }: PersonReplayScreenProps) {
  const snackbar = useSnackbar();
  const mounted = useRef(true);
  const cancelled = useRef(false);

  const [listing, setListing] = useState<ClipListing>(readClips);
  const clips = listing.clips;
  const loadError = listing.error;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ReplayProgress | null>(null);
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [reportUri, setReportUri] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    mounted.current = true;
    cancelled.current = false;
    return () => {
      mounted.current = false;
      cancelled.current = true;
    };
  }, []);

  const scores = useMemo(() => {
    const byId = new Map<string, ClipScore>();
    for (const score of report?.scores ?? []) byId.set(score.id, score);
    return byId;
  }, [report]);

  const frameTotal = clips.reduce(
    (total, clip) => total + clip.manifest.frames.length,
    0,
  );

  const run = async () => {
    if (running || clips.length === 0) return;
    cancelled.current = false;
    setRunning(true);
    setStale(false);
    try {
      const ordered = [...clips].sort(
        (a, b) => a.manifest.createdAt - b.manifest.createdAt,
      );
      const result = await replayDataset(
        ordered,
        (next) => {
          if (mounted.current) setProgress(next);
        },
        () => cancelled.current,
      );
      if (!mounted.current) return;
      const text = formatReport(result);
      const partial = result.scores.length < ordered.length;
      let uri: string | null = null;
      if (!partial) {
        console.log(text);
        try {
          uri = saveReport(text, result.generatedAt);
        } catch {
          uri = null;
        }
      }
      setReport(result);
      setMarkdown(partial ? null : text);
      setReportUri(uri);
      if (partial) {
        snackbar.show(
          `Replay stopped after ${result.scores.length} of ${ordered.length} clips. Partial results were not saved.`,
          { variant: "info" },
        );
      }
    } catch (error) {
      if (mounted.current) {
        snackbar.show(errorMessage(error, "The replay could not finish."), {
          variant: "error",
        });
      }
    } finally {
      if (mounted.current) {
        setRunning(false);
        setProgress(null);
      }
    }
  };

  const share = async () => {
    if (!markdown) return;
    try {
      await Share.share({ title: "Person detection replay", message: markdown });
    } catch (error) {
      snackbar.show(errorMessage(error, "The report could not be shared."), {
        variant: "error",
      });
    }
  };

  const relabel = (clip: StoredClip, label: ClipLabel) => {
    try {
      const updated = relabelClip(clip, label);
      setListing((current) => ({
        ...current,
        clips: current.clips.map((entry) =>
          entry.manifest.id === clip.manifest.id ? updated : entry,
        ),
      }));
      if (report) setStale(true);
    } catch (error) {
      snackbar.show(errorMessage(error, "The label could not be saved."), {
        variant: "error",
      });
    }
  };

  const remove = (clip: StoredClip) => {
    Alert.alert(
      "Delete this clip?",
      `${clip.manifest.frames.length} frames will be removed from this phone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            try {
              deleteClip(clip);
            } catch (error) {
              snackbar.show(
                errorMessage(error, "The clip could not be deleted."),
                { variant: "error" },
              );
            }
            setListing(readClips());
            if (report) setStale(true);
          },
        },
      ],
    );
  };

  const summary = report?.summary;

  return (
    <Screen
      bottomClearance={false}
      contentStyle={styles.content}
      header={
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the human detector"
            hitSlop={8}
            disabled={running}
            onPress={onExit}
            style={({ pressed }) => [
              styles.back,
              pressed && styles.pressed,
              running && styles.disabled,
            ]}
          >
            <Icon name="back" size={18} color={colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.overline}>Human detector · dev</Text>
            <Text style={styles.title}>Detection replay</Text>
            <Text style={styles.subtitle}>
              {`${clips.length} clips · ${frameTotal} frames`}
            </Text>
          </View>
        </View>
      }
    >
      {loadError ? (
        <HintRow tone="danger" title="Could not read clips">
          {loadError}
        </HintRow>
      ) : null}

      <View style={styles.actions}>
        <GeneralButton
          label={running ? "Stop replay" : "Run replay"}
          icon={running ? "stop" : "play"}
          variant={running ? "danger" : "primary"}
          disabled={!running && clips.length === 0}
          onPress={
            running
              ? () => {
                  cancelled.current = true;
                }
              : run
          }
          style={styles.actionMain}
          fullWidth
        />
        <GeneralButton
          label="Share report"
          icon="share"
          variant="outline"
          disabled={!markdown || running}
          onPress={share}
        />
      </View>

      {progress ? (
        <HintRow tone="info" title="Replaying">
          {`Clip ${progress.clip} of ${progress.clips} · frame ${progress.frame} of ${progress.frames}`}
        </HintRow>
      ) : null}

      {stale ? (
        <HintRow tone="warning" title="Results are out of date">
          Clips were relabelled or deleted since this run. Run the replay again
          before recording numbers.
        </HintRow>
      ) : null}

      {summary ? (
        <View style={styles.tiles}>
          <Tile
            label="Undercount"
            value={formatPercent(summary.under, summary.clips)}
            accent="danger"
          />
          <Tile
            label="Accuracy"
            value={formatPercent(summary.correct, summary.clips)}
            accent="success"
          />
          <Tile
            label="Overcount"
            value={formatPercent(summary.over, summary.clips)}
          />
          <Tile
            label="Never settled"
            value={formatPercent(summary.unsettled, summary.clips)}
          />
          <Tile
            label="Stable undercount"
            value={formatPercent(summary.stableUndercount, summary.clips)}
          />
          <Tile
            label="Median settle"
            value={formatSeconds(summary.medianSettleMs)}
          />
        </View>
      ) : null}

      {reportUri ? (
        <HintRow tone="neutral" title="Report saved">
          {`${reportUri}\nThe same markdown was printed to the Metro console.`}
        </HintRow>
      ) : null}

      {clips.length === 0 && !loadError ? (
        <HintRow tone="info" title="No clips yet">
          Open the human detector, tap Dataset, set how many people are really
          in view, then record a clip.
        </HintRow>
      ) : null}

      {clips.map((clip) => (
        <ClipCard
          key={clip.manifest.id}
          clip={clip}
          score={scores.get(clip.manifest.id) ?? null}
          disabled={running}
          onRelabel={(label) => relabel(clip, label)}
          onDelete={() => remove(clip)}
        />
      ))}
    </Screen>
  );
}

function Tile({
  label,
  value,
  accent = "none",
}: {
  label: string;
  value: string;
  accent?: "none" | "danger" | "success";
}) {
  return (
    <Card accent={accent} padding="md" style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </Card>
  );
}

function ClipCard({
  clip,
  score,
  disabled,
  onRelabel,
  onDelete,
}: {
  clip: StoredClip;
  score: ClipScore | null;
  disabled: boolean;
  onRelabel: (label: ClipLabel) => void;
  onDelete: () => void;
}) {
  const { manifest } = clip;
  const frames = manifest.frames;
  const durationMs =
    frames.length > 1
      ? frames[frames.length - 1].capturedAt - frames[0].capturedAt
      : 0;
  const count = manifest.label.count;
  const tags = manifest.label.tags.map(clipTagLabel).join(", ");

  return (
    <Card padding="base" style={styles.clip}>
      <View style={styles.clipHead}>
        <View style={styles.clipText}>
          <Text style={styles.clipTitle}>
            {`${count} ${count === 1 ? "person" : "people"}${tags ? ` · ${tags}` : ""}`}
          </Text>
          <Text style={styles.clipMeta}>
            {`${frames.length} frames · ${formatSeconds(durationMs)} · ${new Date(manifest.createdAt).toLocaleString()}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete clip"
          hitSlop={8}
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          <Icon name="delete" size={18} color={colors.danger} />
        </Pressable>
      </View>

      {score ? (
        <View style={styles.result}>
          <Chip
            label={outcomeLabel(score.outcome)}
            tone={OUTCOME_TONE[score.outcome]}
            size="sm"
          />
          <Text style={styles.resultText}>
            {`Final ${score.finalCount ?? "—"} · settle ${formatSeconds(score.settleMs)} · ${Math.round(score.meanDetectMs)} ms/frame`}
          </Text>
          {score.stableUndercount ? (
            <Chip label="Stable undercount" tone="danger" size="sm" icon="warning" />
          ) : null}
        </View>
      ) : null}

      <ClipLabelEditor
        label={manifest.label}
        onChange={onRelabel}
        disabled={disabled}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  overline: {
    color: colors.primary,
    ...typography.overline,
  },
  title: {
    color: colors.text,
    ...typography.title,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionMain: {
    flexGrow: 1,
    minWidth: 160,
  },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    gap: spacing.xs,
  },
  tileLabel: {
    color: colors.textMuted,
    ...typography.overline,
  },
  tileValue: {
    color: colors.text,
    ...typography.heading,
    fontVariant: ["tabular-nums"],
  },
  clip: {
    gap: spacing.md,
  },
  clipHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  clipText: {
    flex: 1,
    gap: 2,
  },
  clipTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  clipMeta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerTint,
  },
  result: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultText: {
    color: colors.textSecondary,
    ...typography.caption,
    fontVariant: ["tabular-nums"],
  },
});

export default PersonReplayScreen;
