import { useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from "react-native";

import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { Avatar } from "@/components/ui/Avatar";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/modals/Modal";
import { Select } from "@/components/ui/Select";
import {
  ACCESS_STATUS_KEYS,
  FLOOR_OPTIONS,
  STAFF_ROLE_OPTIONS,
  floorShortLabel,
  MANDATORY_FLOOR,
  selectableFloors,
  withMandatoryFloor,
} from "@/constants/floors";
import { colors, radius, spacing, typography } from "@/constants/themeColor";
import { errorMessage } from "@/lib/errors";
import { pickStaffPhotoBase64 } from "@/services/storageService";
import type {
  AccessStatusKey,
  FloorKey,
  StaffRoleKey,
  StaffRow,
} from "@/types/database";

export type StaffDraft = {
  fullName: string;
  email: string;
  companyId: string;
  role: StaffRoleKey;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoBase64: string | null;
};

export type StaffEditPatch = {
  companyId: string;
  role: StaffRoleKey;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoBase64: string | null;
  removePhoto: boolean;
};

export type StaffCreateEditModalProps = {
  visible: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  member?: StaffRow;
  photoUrl?: string | null;
  submitting?: boolean;
  onCreate: (draft: StaffDraft) => void;
  onEdit: (id: string, patch: StaffEditPatch) => void;
};

type FormState = {
  fullName: string;
  email: string;
  companyId: string;
  role: StaffRoleKey;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoBase64: string | null;
  removePhoto: boolean;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMPANY_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

const EMPTY: FormState = {
  fullName: "",
  email: "",
  companyId: "",
  role: "CompanyPersonnel",
  authorizedFloors: [],
  accessStatus: "Active",
  photoBase64: null,
  removePhoto: false,
};

function fromMember(member: StaffRow): FormState {
  return {
    fullName: member.full_name,
    email: member.email,
    companyId: member.company_id,
    role: member.role,
    authorizedFloors: selectableFloors(member.authorized_floors),
    accessStatus: member.access_status,
    photoBase64: null,
    removePhoto: false,
  };
}

function validate(form: FormState, isEdit: boolean): FormErrors {
  const errors: FormErrors = {};

  if (!isEdit) {
    const name = form.fullName.trim();
    if (!name) errors.fullName = "Enter the staff member’s full name.";
    else if (name.length < 2 || name.length > 120)
      errors.fullName = "Use between 2 and 120 characters.";

    const email = form.email.trim();
    if (!email) errors.email = "Enter a Gmail address.";
    else if (!EMAIL_PATTERN.test(email))
      errors.email = "That doesn’t look like a valid email.";
  }

  const companyId = form.companyId.trim().toUpperCase();
  if (!companyId) errors.companyId = "Enter a company ID.";
  else if (!COMPANY_ID_PATTERN.test(companyId))
    errors.companyId = "Use 3–32 characters: A–Z, 0–9 and dashes.";

  return errors;
}

export function StaffCreateEditModal(props: StaffCreateEditModalProps) {
  if (!props.visible) return null;
  return <StaffFormModal {...props} />;
}

function StaffFormModal({
  onClose,
  mode,
  member,
  photoUrl,
  submitting = false,
  onCreate,
  onEdit,
}: StaffCreateEditModalProps) {
  const snackbar = useSnackbar();
  const isEdit = mode === "edit";

  const [form, setForm] = useState<FormState>(() =>
    isEdit && member ? fromMember(member) : EMPTY,
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (submitted) setErrors(validate(next, isEdit));
      return next;
    });
  };

  const liveErrors = submitted ? errors : {};

  const previewUri = form.photoBase64
    ? `data:image/jpeg;base64,${form.photoBase64}`
    : form.removePhoto
      ? null
      : (photoUrl ?? null);

  const handlePickPhoto = async () => {
    if (pickingPhoto || submitting) return;
    setPickingPhoto(true);
    try {
      const base64 = await pickStaffPhotoBase64();
      if (base64) {
        setForm((current) => ({
          ...current,
          photoBase64: base64,
          removePhoto: false,
        }));
      }
    } catch (error) {
      snackbar.show(errorMessage(error, "That photo could not be used."), {
        variant: "error",
      });
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleSubmit = () => {
    const nextErrors = validate(form, isEdit);
    setErrors(nextErrors);
    setSubmitted(true);

    if (Object.keys(nextErrors).length > 0) {
      snackbar.show("Check the highlighted fields", { variant: "error" });
      return;
    }

    const authorizedFloors = withMandatoryFloor(form.authorizedFloors);

    if (isEdit && member) {
      onEdit(member.id, {
        companyId: form.companyId.trim().toUpperCase(),
        role: form.role,
        authorizedFloors,
        accessStatus: form.accessStatus,
        photoBase64: form.photoBase64,
        removePhoto: form.removePhoto,
      });
      return;
    }

    onCreate({
      fullName: form.fullName.trim().replace(/\s+/g, " "),
      email: form.email.trim().toLowerCase(),
      companyId: form.companyId.trim().toUpperCase(),
      role: form.role,
      authorizedFloors,
      accessStatus: form.accessStatus,
      photoBase64: form.photoBase64,
    });
  };

  const isGuest = form.role === "Guest";
  const createLabel = isGuest ? "Confirm" : "Continue";

  const summary = isEdit
    ? "Update the badge, role, floor access, photo or status."
    : isGuest
      ? "Add a guest and confirm — no face registration needed."
      : "Add a person, choose their floors, then register their face.";

  return (
    <Modal
      visible
      onClose={onClose}
      title={isEdit ? "Edit staff member" : "Add staff member"}
      subtitle={summary}
      icon={isEdit ? "edit" : "staff"}
      dismissOnBackdropPress={!submitting}
      footer={
        <View style={styles.footer}>
          <GeneralButton
            label="Cancel"
            variant="outline"
            onPress={onClose}
            disabled={submitting}
            style={styles.footerBtn}
          />
          <GeneralButton
            label={isEdit ? "Save changes" : createLabel}
            icon={isEdit || isGuest ? "check" : "face"}
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      <View style={styles.form}>
        <View style={styles.photoRow}>
          <Avatar
            name={isEdit ? (member?.full_name ?? "") : form.fullName.trim()}
            imageUri={previewUri}
            size={64}
            tone="brand"
          />
          <View style={styles.photoText}>
            <Text style={styles.photoTitle}>Profile picture</Text>
            <View style={styles.photoActions}>
              <Pressable
                accessibilityRole="button"
                disabled={pickingPhoto || submitting}
                onPress={handlePickPhoto}
                style={({ pressed }) => [
                  styles.uploadBtn,
                  pressed && styles.uploadBtnPressed,
                ]}
              >
                <Icon name="camera" size={16} color={colors.primary} />
                <Text style={styles.uploadLabel}>
                  {pickingPhoto
                    ? "Opening…"
                    : previewUri
                      ? "Replace"
                      : "Upload photo"}
                </Text>
              </Pressable>
              {previewUri ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      photoBase64: null,
                      removePhoto: true,
                    }))
                  }
                  hitSlop={6}
                >
                  <Text style={styles.removeLabel}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {isEdit ? (
          <View style={styles.lockedBlock}>
            <View style={styles.lockedRow}>
              <Icon name="person" size={16} color={colors.textMuted} />
              <Text style={styles.lockedLabel}>Full name</Text>
              <Text style={styles.lockedValue} numberOfLines={1}>
                {member?.full_name}
              </Text>
            </View>
            <View style={styles.lockedRow}>
              <Icon name="mail" size={16} color={colors.textMuted} />
              <Text style={styles.lockedLabel}>Gmail</Text>
              <Text style={styles.lockedValue} numberOfLines={1}>
                {member?.email}
              </Text>
            </View>
            <Text style={styles.lockedNote}>
              Name and Gmail are fixed after creation. Delete and re-add the
              record if they change.
            </Text>
          </View>
        ) : (
          <>
            <Input
              label="Full name"
              icon="person"
              value={form.fullName}
              onChangeText={(text) => set("fullName", text)}
              error={liveErrors.fullName}
              autoCapitalize="words"
              returnKeyType="next"
              editable={!submitting}
              onSubmitEditing={() => emailRef.current?.focus()}
              containerStyle={styles.field}
            />
            <Input
              ref={emailRef}
              label="Gmail"
              type="email"
              icon="mail"
              value={form.email}
              onChangeText={(text) => set("email", text)}
              error={liveErrors.email}
              returnKeyType="next"
              editable={!submitting}
              onSubmitEditing={() => companyRef.current?.focus()}
              containerStyle={styles.field}
            />
          </>
        )}

        <Input
          ref={companyRef}
          label="Company ID"
          icon="badge"
          value={form.companyId}
          onChangeText={(text) => set("companyId", text.toUpperCase())}
          error={liveErrors.companyId}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
          helperText="This is the value encoded in the staff barcode."
          returnKeyType="done"
          containerStyle={styles.field}
        />

        <Select
          label="Role"
          icon="shield"
          options={STAFF_ROLE_OPTIONS}
          value={form.role}
          onChange={(value) => set("role", value as StaffRoleKey)}
          placeholder="Select a role"
          sheetTitle="Staff role"
          disabled={isEdit}
          helperText={
            isGuest
              ? "Guests pass on the badge scan alone. Their face is captured at the door, not matched."
              : "Company personnel must pass badge and face verification."
          }
          containerStyle={styles.field}
        />

        <Select
          label="Authorized floors"
          icon="floors"
          multiple
          options={FLOOR_OPTIONS}
          value={form.authorizedFloors}
          onChange={(value) => set("authorizedFloors", value as FloorKey[])}
          placeholder="Main Lobby only"
          sheetTitle="Authorized floors"
          helperText={`${floorShortLabel(MANDATORY_FLOOR)} is always included and cannot be removed.`}
          containerStyle={styles.field}
        />

        <View style={styles.field}>
          <Text style={styles.statusLabel}>Access status</Text>
          <View style={styles.statusToggle}>
            {ACCESS_STATUS_KEYS.map((option) => {
              const active = form.accessStatus === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={submitting}
                  onPress={() => set("accessStatus", option)}
                  style={[
                    styles.statusOption,
                    active && styles.statusOptionActive,
                  ]}
                >
                  <Icon
                    name={option === "Active" ? "checkCircle" : "lock"}
                    size={16}
                    color={active ? colors.onPrimary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      active && styles.statusTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {isEdit ? null : isGuest ? (
          <HintRow tone="info" title="Next step">
            Confirm to add the guest straight away. At the door they only scan
            their badge — the camera captures their face for the log, but it is
            never matched against an enrolled template.
          </HintRow>
        ) : (
          <HintRow tone="info" title="Next step">
            After saving, the camera opens to register this person’s face. Only
            the mathematical face template is stored — no face photo is
            uploaded.
          </HintRow>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.base,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.base,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  photoText: {
    flex: 1,
    gap: spacing.sm,
  },
  photoTitle: {
    color: colors.text,
    ...typography.bodyStrong,
  },
  photoActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  uploadBtnPressed: {
    backgroundColor: colors.primaryTint,
  },
  uploadLabel: {
    color: colors.primary,
    ...typography.label,
  },
  removeLabel: {
    color: colors.textMuted,
    ...typography.label,
  },
  lockedBlock: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  lockedLabel: {
    color: colors.textMuted,
    ...typography.caption,
    width: 70,
  },
  lockedValue: {
    flex: 1,
    color: colors.text,
    ...typography.bodyStrong,
  },
  lockedNote: {
    color: colors.textMuted,
    ...typography.caption,
    lineHeight: 16,
  },
  statusLabel: {
    color: colors.textMuted,
    ...typography.overline,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  statusToggle: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statusOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  statusTextActive: {
    color: colors.onPrimary,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  footerBtn: {
    flex: 1,
  },
});

export default StaffCreateEditModal;
