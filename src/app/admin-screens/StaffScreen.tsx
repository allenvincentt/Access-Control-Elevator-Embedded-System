import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { Skeleton } from "@/components/common/SkeletonLoader";
import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Avatar } from "@/components/ui/Avatar";
import { FloatingActionButton } from "@/components/ui/buttons/FloatingActionButton";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DetailRow } from "@/components/ui/DetailRow";
import { Icon } from "@/components/ui/Icon";
import { MessageBoxModal } from "@/components/ui/modals/MessageBoxModal";
import { floorShortLabel } from "@/constants/floors";
import {
  colors,
  layout,
  radius,
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useStaff } from "@/hooks/useStaff";
import { errorMessage } from "@/lib/errors";
import type { AccessStatusKey, StaffRow } from "@/types/database";

type StatusFilter = AccessStatusKey | "all";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Active", label: "Active" },
  { key: "Suspended", label: "Suspended" },
];

export type StaffScreenProps = {
  onCreate: () => void;
  onEdit: (member: StaffRow) => void;
  onReenrol: (member: StaffRow) => void;
};

function FloorChips({ floors, max = 3 }: { floors: string[]; max?: number }) {
  const shown = floors.slice(0, max);
  const remaining = floors.length - shown.length;
  return (
    <View style={styles.floorChips}>
      {shown.map((floor) => (
        <Chip
          key={floor}
          label={floorShortLabel(floor)}
          size="sm"
          tone="gold"
        />
      ))}
      {remaining > 0 ? (
        <Chip label={`+${remaining}`} size="sm" tone="neutral" />
      ) : null}
    </View>
  );
}

function FaceChip({ member }: { member: StaffRow }) {
  const enrolled = member.face_template_count > 0;
  return (
    <Chip
      label={enrolled ? `Face ×${member.face_template_count}` : "No face"}
      tone={enrolled ? "info" : "danger"}
      size="sm"
      icon={enrolled ? "face" : "warning"}
    />
  );
}

function StaffCard({
  member,
  photoUrl,
  onMenu,
}: {
  member: StaffRow;
  photoUrl?: string;
  onMenu: (member: StaffRow) => void;
}) {
  return (
    <Card padding="base" elevated>
      <View style={styles.cardTop}>
        <Avatar name={member.full_name} imageUri={photoUrl} size={48} />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {member.full_name}
          </Text>
          <Text style={styles.cardRole} numberOfLines={1}>
            {member.company_id}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${member.full_name}`}
          hitSlop={8}
          onPress={() => onMenu(member)}
          style={({ pressed }) => [
            styles.kebab,
            pressed && styles.kebabPressed,
          ]}
        >
          <Icon name="more" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <Chip
          label={member.access_status}
          tone={member.access_status === "Active" ? "success" : "danger"}
          size="sm"
          icon={member.access_status === "Active" ? "checkCircle" : "lock"}
        />
        <FaceChip member={member} />
      </View>

      <View style={styles.cardDetails}>
        <DetailRow icon="mail" label="Gmail" value={member.email} />
        <DetailRow icon="badge" label="Company ID" value={member.company_id} />
      </View>

      <View style={styles.floorsBlock}>
        <Text style={styles.floorsLabel}>Authorized floors</Text>
        <FloorChips floors={member.authorized_floors} />
      </View>
    </Card>
  );
}

function StaffTableRow({
  member,
  photoUrl,
  onMenu,
}: {
  member: StaffRow;
  photoUrl?: string;
  onMenu: (member: StaffRow) => void;
}) {
  return (
    <View style={styles.tRow}>
      <View style={[styles.tCell, styles.colStaff]}>
        <Avatar name={member.full_name} imageUri={photoUrl} size={40} />
        <View style={styles.tStaffText}>
          <Text style={styles.tName} numberOfLines={1}>
            {member.full_name}
          </Text>
          <Text style={styles.tSub} numberOfLines={1}>
            {member.email}
          </Text>
        </View>
      </View>
      <View style={[styles.tCell, styles.colBadge]}>
        <Text style={styles.tValue} numberOfLines={1}>
          {member.company_id}
        </Text>
        <FaceChip member={member} />
      </View>
      <View style={[styles.tCell, styles.colFloors]}>
        <FloorChips floors={member.authorized_floors} />
      </View>
      <View style={[styles.tCell, styles.colStatus]}>
        <Chip
          label={member.access_status}
          tone={member.access_status === "Active" ? "success" : "danger"}
          size="sm"
        />
      </View>
      <View style={[styles.tCell, styles.colActions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${member.full_name}`}
          hitSlop={8}
          onPress={() => onMenu(member)}
          style={({ pressed }) => [
            styles.kebab,
            pressed && styles.kebabPressed,
          ]}
        >
          <Icon name="more" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export function StaffScreen({ onCreate, onEdit, onReenrol }: StaffScreenProps) {
  const {
    items,
    photoUrls,
    total,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    refresh,
    loadMore,
    deleteStaff,
    resetFace,
  } = useStaff();

  const snackbar = useSnackbar();
  const { width } = useWindowDimensions();
  const wide = width >= 720;

  const [menuFor, setMenuFor] = useState<StaffRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<StaffRow | null>(null);
  const [resetFaceFor, setResetFaceFor] = useState<StaffRow | null>(null);

  const menuItems: ActionMenuItem[] = menuFor
    ? [
        {
          key: "edit",
          label: "Edit staff member",
          icon: "edit",
          onPress: () => onEdit(menuFor),
        },
        {
          key: "reenrol",
          label:
            menuFor.face_template_count > 0
              ? "Re-register face"
              : "Register face",
          icon: "face",
          onPress: () => onReenrol(menuFor),
        },
        ...(menuFor.face_template_count > 0
          ? [
              {
                key: "clear-face",
                label: "Clear face enrollment",
                icon: "cameraOff" as const,
                tone: "danger" as const,
                onPress: () => setResetFaceFor(menuFor),
              },
            ]
          : []),
        {
          key: "delete",
          label: "Delete staff member",
          icon: "delete",
          tone: "danger",
          onPress: () => setDeleteFor(menuFor),
        },
      ]
    : [];

  const confirmDelete = async () => {
    if (!deleteFor) return;
    const target = deleteFor;
    setDeleteFor(null);
    try {
      await deleteStaff(target.id);
      snackbar.show(`${target.full_name} removed`, { variant: "success" });
    } catch (caught) {
      snackbar.show(
        errorMessage(caught, "The staff member could not be deleted."),
        {
          variant: "error",
        },
      );
    }
  };

  const confirmResetFace = async () => {
    if (!resetFaceFor) return;
    const target = resetFaceFor;
    setResetFaceFor(null);
    try {
      await resetFace(target.id);
      snackbar.show(`Face enrollment cleared for ${target.full_name}`, {
        variant: "success",
      });
    } catch (caught) {
      snackbar.show(
        errorMessage(caught, "The enrollment could not be cleared."),
        {
          variant: "error",
        },
      );
    }
  };

  return (
    <View style={styles.root}>
      <Screen
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        header={<ScreenHeader overline="Access management" title="Staff" />}
      >
        <View style={styles.searchField}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <View style={styles.searchInputWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, Gmail, or company ID"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search staff"
              cursorColor={colors.primary}
              selectionColor={colors.focusRing}
            />
          </View>
          {search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => setSearch("")}
            >
              <Icon name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setStatusFilter(filter.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    active && styles.filterLabelActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <HintRow tone="danger" title="Could not load staff">
            {error}
          </HintRow>
        ) : null}

        {loading ? (
          <View style={styles.cards}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={168} rounded="lg" />
            ))}
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="staff" size={26} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {search || statusFilter !== "all"
                ? "No staff match your filters"
                : "No staff yet"}
            </Text>
            <Text style={styles.emptyBody}>
              {search || statusFilter !== "all"
                ? "Try a different search term or clear the status filter."
                : "Add your first staff member to start granting elevator access."}
            </Text>
          </View>
        ) : wide ? (
          <View style={styles.table}>
            <View style={styles.tHeader}>
              <Text style={[styles.tHeaderText, styles.colStaff]}>
                Staff member
              </Text>
              <Text style={[styles.tHeaderText, styles.colBadge]}>
                Company ID
              </Text>
              <Text style={[styles.tHeaderText, styles.colFloors]}>
                Authorized floors
              </Text>
              <Text style={[styles.tHeaderText, styles.colStatus]}>Status</Text>
              <Text style={[styles.tHeaderText, styles.colActions]}> </Text>
            </View>
            {items.map((member, index) => (
              <View key={member.id}>
                {index > 0 ? <View style={styles.tDivider} /> : null}
                <StaffTableRow
                  member={member}
                  photoUrl={
                    member.photo_path ? photoUrls[member.photo_path] : undefined
                  }
                  onMenu={setMenuFor}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.cards}>
            {items.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                photoUrl={
                  member.photo_path ? photoUrls[member.photo_path] : undefined
                }
                onMenu={setMenuFor}
              />
            ))}
          </View>
        )}

        {hasMore ? (
          <GeneralButton
            label={loadingMore ? "Loading…" : "Load more"}
            variant="outline"
            fullWidth
            loading={loadingMore}
            disabled={loadingMore}
            onPress={() => void loadMore()}
          />
        ) : null}

        <ActionMenu
          visible={menuFor != null}
          onClose={() => setMenuFor(null)}
          title={menuFor?.full_name ?? "Actions"}
          subtitle={
            menuFor
              ? `${menuFor.company_id} · ${menuFor.access_status}`
              : undefined
          }
          items={menuItems}
        />

        <MessageBoxModal
          visible={deleteFor != null}
          onClose={() => setDeleteFor(null)}
          onConfirm={() => void confirmDelete()}
          tone="danger"
          icon="delete"
          title="Delete staff member?"
          message={
            deleteFor
              ? `${deleteFor.full_name} will lose all elevator access immediately and their face template will be erased. Access history is kept. This can’t be undone.`
              : ""
          }
          confirmLabel="Delete"
        />

        <MessageBoxModal
          visible={resetFaceFor != null}
          onClose={() => setResetFaceFor(null)}
          onConfirm={() => void confirmResetFace()}
          tone="warning"
          icon="cameraOff"
          title="Clear face enrollment?"
          message={
            resetFaceFor
              ? `${resetFaceFor.full_name} will be denied at the face step until they are re-registered.`
              : ""
          }
          confirmLabel="Clear"
        />
      </Screen>

      <FloatingActionButton
        icon="add"
        onPress={onCreate}
        accessibilityLabel="Add staff member"
        style={styles.fab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: layout.bottomNavClearance,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 50,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    color: colors.text,
    padding: 0,
    ...typography.body,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  filterLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  filterLabelActive: {
    color: colors.primaryDeep,
  },
  cards: {
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardIdentity: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    color: colors.text,
    ...typography.subheading,
  },
  cardRole: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  kebab: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  kebabPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  statusRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  cardDetails: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.hair,
  },
  floorsBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  floorsLabel: {
    color: colors.textMuted,
    ...typography.overline,
    letterSpacing: 0.4,
  },
  floorChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  table: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...shadow.sm,
  },
  tHeader: {
    flexDirection: "row",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tHeaderText: {
    ...typography.overline,
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  tRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  tDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  tCell: {
    paddingRight: spacing.sm,
    justifyContent: "center",
  },
  colStaff: {
    flex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  colBadge: { flex: 2, gap: spacing.xs },
  colFloors: { flex: 2.4 },
  colStatus: { flex: 1.2 },
  colActions: { width: 40, alignItems: "flex-end", paddingRight: 0 },
  tStaffText: {
    flex: 1,
    gap: 1,
  },
  tName: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  tSub: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  tValue: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  empty: {
    marginTop: spacing["3xl"],
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  emptyBody: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
});

export default StaffScreen;
