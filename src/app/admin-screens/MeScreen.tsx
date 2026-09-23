import { useCallback, useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ScrollReveal } from "@/components/common/animations";
import { Screen } from "@/components/layout/Screen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DetailRow } from "@/components/ui/DetailRow";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MessageBoxModal } from "@/components/ui/modals/MessageBoxModal";
import {
  brandGradient,
  colors,
  layout,
  palette,
  radius,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useAuth } from "@/hooks/useAuth";
import type { UserRoleKey } from "@/types/database";

const TABLET_WIDTH = 760;
const DESKTOP_WIDTH = 1000;
const MAX_CONTENT_WIDTH = 1120;

type Permission = { icon: IconName; title: string; detail: string };

const ROLE_COPY: Record<
  UserRoleKey,
  { label: string; blurb: string; permissions: Permission[] }
> = {
  Admin: {
    label: "Administrator",
    blurb:
      "Full control over staff records, authorized floors, face enrollment, and access logs.",
    permissions: [
      {
        icon: "staff",
        title: "Staff records",
        detail: "Add, edit, suspend, and remove staff.",
      },
      {
        icon: "floors",
        title: "Authorized floors",
        detail: "Decide which floors each person can reach.",
      },
      {
        icon: "face",
        title: "Face enrollment",
        detail: "Capture and replace enrollment photos.",
      },
      {
        icon: "logs",
        title: "Access logs",
        detail: "Review every granted and denied ride.",
      },
    ],
  },
};

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MeScreen() {
  const { profile, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  }, []);

  if (!profile) return null;
  const role = ROLE_COPY[profile.user_role];

  const width =
    measured ||
    Math.min(
      Math.max(windowWidth - layout.screenPadding * 2, 280),
      MAX_CONTENT_WIDTH,
    );
  const wide = width >= TABLET_WIDTH;
  const desktop = width >= DESKTOP_WIDTH;

  const openConfirm = () => setConfirmOut(true);

  return (
    <Screen header={<ScreenHeader title="Me" />}>
      <View style={styles.content} onLayout={handleLayout}>
        <ScrollReveal>
          <Card padding="none" elevated style={styles.heroCard}>
            <View style={[styles.banner, wide && styles.bannerWide]}>
              <View style={styles.bannerGlow} />
            </View>
            <View
              style={[styles.heroBody, wide ? styles.heroBodyWide : null]}
            >
              <Avatar
                name={profile.full_name}
                size={wide ? 104 : 88}
                tone="brand"
                ring
                style={[styles.avatar, wide ? styles.avatarWide : null]}
              />
              <View
                style={[styles.identity, wide ? styles.identityWide : null]}
              >
                <Text
                  style={[styles.name, wide ? styles.nameWide : null]}
                  numberOfLines={2}
                >
                  {profile.full_name}
                </Text>
                <Text
                  style={[styles.email, wide ? styles.textLeft : null]}
                  numberOfLines={1}
                >
                  {profile.email}
                </Text>
                <View
                  style={[styles.chips, wide ? styles.chipsWide : null]}
                >
                  <Chip label={role.label} tone="brand" icon="adminRole" />
                  <Chip
                    label={profile.is_active ? "Active" : "Inactive"}
                    tone={profile.is_active ? "success" : "neutral"}
                    icon={profile.is_active ? "checkCircle" : "lock"}
                  />
                </View>
              </View>
              {wide ? (
                <GeneralButton
                  label="Log out"
                  icon="logout"
                  variant="outline"
                  size="sm"
                  onPress={openConfirm}
                  style={styles.heroAction}
                />
              ) : null}
            </View>
          </Card>
        </ScrollReveal>

        <View style={[styles.row, !wide && styles.rowStacked]}>
          <Panel
            title="Account details"
            subtitle="Your sign-in identity for the admin console."
            icon="person"
            delay={120}
            style={wide ? styles.flexEqual : styles.full}
          >
            <View style={[styles.details, desktop && styles.detailsGrid]}>
              <DetailRow
                icon="person"
                label="Full name"
                value={profile.full_name}
                style={desktop ? styles.detailCell : null}
              />
              <DetailRow
                icon="mail"
                label="Email"
                value={profile.email}
                style={desktop ? styles.detailCell : null}
              />
              <DetailRow
                icon="shield"
                label="User role"
                value={role.label}
                style={desktop ? styles.detailCell : null}
              />
              <DetailRow
                icon="badge"
                label="Account status"
                value={profile.is_active ? "Active" : "Inactive"}
                style={desktop ? styles.detailCell : null}
              />
              <DetailRow
                icon="calendar"
                label="Member since"
                value={formatDate(profile.created_at)}
                style={desktop ? styles.detailCell : null}
              />
              <DetailRow
                icon="time"
                label="Last updated"
                value={formatDate(profile.updated_at)}
                style={desktop ? styles.detailCell : null}
              />
            </View>
          </Panel>

          <Panel
            title="Permissions"
            subtitle={role.blurb}
            icon="key"
            delay={200}
            style={wide ? styles.flexEqual : styles.full}
          >
            <View style={styles.permissions}>
              {role.permissions.map((item) => (
                <View key={item.title} style={styles.permission}>
                  <View style={styles.permissionIcon}>
                    <Icon name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.permissionText}>
                    <Text style={styles.permissionTitle}>{item.title}</Text>
                    <Text style={styles.permissionDetail}>{item.detail}</Text>
                  </View>
                  <Icon name="check" size={16} color={colors.success} />
                </View>
              ))}
            </View>
          </Panel>
        </View>

        <ScrollReveal delay={280}>
          <View style={[styles.session, wide && styles.sessionWide]}>
            <View style={styles.sessionInfo}>
              <View style={styles.sessionIcon}>
                <Icon name="info" size={18} color={colors.info} />
              </View>
              <View style={styles.sessionText}>
                <Text style={styles.sessionTitle}>Signed in on this device</Text>
                <Text style={styles.sessionDetail}>
                  Logging out ends this session. You’ll need your email and
                  password to sign back in.
                </Text>
              </View>
            </View>
            {wide ? null : (
              <GeneralButton
                label="Log out"
                icon="logout"
                variant="danger"
                fullWidth
                onPress={openConfirm}
              />
            )}
          </View>
        </ScrollReveal>
      </View>

      <MessageBoxModal
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => {
          setConfirmOut(false);
          void signOut();
        }}
        tone="warning"
        icon="logout"
        title="Log out of Elevator System?"
        message="You’ll need your email and password to sign back in."
        confirmLabel="Log out"
      />
    </Screen>
  );
}

type PanelProps = {
  title: string;
  subtitle?: string;
  icon: IconName;
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function Panel({ title, subtitle, icon, delay = 0, children, style }: PanelProps) {
  return (
    <View style={style}>
      <ScrollReveal delay={delay} style={styles.fill}>
        <Card padding="lg" style={styles.fill}>
          <View style={styles.panelHeader}>
            <View style={styles.panelIcon}>
              <Icon name={icon} size={18} color={colors.primaryDeep} />
            </View>
            <View style={styles.panelHeading}>
              <Text style={styles.panelTitle}>{title}</Text>
              {subtitle ? (
                <Text style={styles.panelSubtitle}>{subtitle}</Text>
              ) : null}
            </View>
          </View>
          {children}
        </Card>
      </ScrollReveal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    gap: spacing.base,
  },
  fill: {
    flexGrow: 1,
  },
  full: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.base,
  },
  rowStacked: {
    flexDirection: "column",
  },
  flexEqual: {
    flex: 1,
    minWidth: 0,
  },
  heroCard: {
    overflow: "hidden",
  },
  banner: {
    height: 96,
    overflow: "hidden",
    ...brandGradient(),
  },
  bannerWide: {
    height: 120,
  },
  bannerGlow: {
    position: "absolute",
    right: -60,
    top: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: palette.gold,
    opacity: 0.18,
  },
  heroBody: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  heroBodyWide: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing["2xl"],
    gap: spacing.xl,
  },
  avatar: {
    marginTop: -44,
    borderWidth: 4,
  },
  avatarWide: {
    marginTop: -52,
  },
  identity: {
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: "100%",
  },
  identityWide: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    paddingTop: spacing.base,
  },
  name: {
    color: colors.text,
    ...typography.title,
    textAlign: "center",
  },
  nameWide: {
    ...typography.display,
    textAlign: "left",
  },
  email: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  textLeft: {
    textAlign: "left",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chipsWide: {
    justifyContent: "flex-start",
  },
  heroAction: {
    alignSelf: "center",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  panelIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryTint,
  },
  panelHeading: {
    flex: 1,
    minWidth: 0,
    gap: spacing.hair,
  },
  panelTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  panelSubtitle: {
    color: colors.textMuted,
    ...typography.caption,
  },
  details: {
    gap: spacing.sm,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.base,
    rowGap: spacing.md,
  },
  detailCell: {
    width: "47%",
    flexGrow: 1,
  },
  permissions: {
    gap: spacing.sm,
  },
  permission: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  permissionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  permissionTitle: {
    color: colors.text,
    ...typography.label,
  },
  permissionDetail: {
    color: colors.textMuted,
    ...typography.caption,
  },
  session: {
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.infoTint,
  },
  sessionWide: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  sessionInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  sessionText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.hair,
  },
  sessionTitle: {
    color: colors.text,
    ...typography.label,
  },
  sessionDetail: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
  },
});

export default MeScreen;
