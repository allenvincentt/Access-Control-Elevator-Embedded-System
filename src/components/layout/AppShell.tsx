import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { Screen } from '@/components/layout/Screen';
import { SideBar } from '@/components/layout/SideBar';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import type { AdminSection } from '@/constants/adminNav';
import { layout, palette, spacing } from '@/constants/themeColor';
import { useAuth } from '@/hooks/useAuth';
import { useStaff } from '@/hooks/useStaff';
import { errorMessage } from '@/lib/errors';
import { updateStaff as updateStaffRequest } from '@/services/staffService';
import { removeStaffPhoto, uploadStaffPhoto } from '@/services/storageService';
import type { FaceSamplePayload, StaffRow } from '@/types/database';

import { HomeScreen } from '@/app/admin-screens/HomeScreen';
import { LogsScreen } from '@/app/admin-screens/LogsScreen';
import { MeScreen } from '@/app/admin-screens/MeScreen';
import { StaffScreen } from '@/app/admin-screens/StaffScreen';
import {
  StaffCreateEditModal,
  type StaffDraft,
  type StaffEditPatch,
} from '@/app/auth/StaffCreateEditModal';
import { FaceEnrollmentScreen } from '@/app/auth/scanner-screens/FaceEnrollmentScreen';

type StaffModalState = { mode: 'create' } | { mode: 'edit'; member: StaffRow } | null;

type EnrollmentState =
  | { kind: 'create'; draft: StaffDraft }
  | { kind: 'reenrol'; member: StaffRow }
  | null;

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth();
  const { createStaff, updateStaff, enrollFace, photoUrls, refresh } = useStaff();
  const snackbar = useSnackbar();

  const { width } = useWindowDimensions();
  const compact = width < layout.compactNavigation;

  const [tab, setTab] = useState<AdminSection>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [staffModal, setStaffModal] = useState<StaffModalState>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentState>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((current) => !current), []);

  const openCreate = useCallback(() => {
    setTab('staff');
    setStaffModal({ mode: 'create' });
  }, []);

  const openEdit = useCallback((member: StaffRow) => {
    setStaffModal({ mode: 'edit', member });
  }, []);

  const openReenrol = useCallback((member: StaffRow) => {
    setEnrollment({ kind: 'reenrol', member });
  }, []);

  const handleEditSubmit = useCallback(
    async (id: string, patch: StaffEditPatch) => {
      setSubmitting(true);
      try {
        const existing = staffModal?.mode === 'edit' ? staffModal.member : null;
        let photoPath: string | null | undefined;

        if (patch.photoBase64) {
          photoPath = await uploadStaffPhoto(id, patch.photoBase64);
        } else if (patch.removePhoto) {
          photoPath = null;
        }

        await updateStaff(id, {
          companyId: patch.companyId,
          role: patch.role,
          authorizedFloors: patch.authorizedFloors,
          accessStatus: patch.accessStatus,
          ...(photoPath !== undefined ? { photoPath } : {}),
        });

        if (photoPath !== undefined && existing?.photo_path && existing.photo_path !== photoPath) {
          await removeStaffPhoto(existing.photo_path).catch(() => undefined);
        }

        setStaffModal(null);
        snackbar.show('Staff member updated', { variant: 'success' });
      } catch (error) {
        snackbar.show(errorMessage(error, 'The staff member could not be updated.'), {
          variant: 'error',
        });
      } finally {
        setSubmitting(false);
      }
    },
    [snackbar, staffModal, updateStaff],
  );

  const submitDraft = useCallback(
    async (draft: StaffDraft, samples: FaceSamplePayload[]) => {
      setSubmitting(true);
      try {
        const created = await createStaff({
          fullName: draft.fullName,
          email: draft.email,
          companyId: draft.companyId,
          role: draft.role,
          authorizedFloors: draft.authorizedFloors,
          accessStatus: draft.accessStatus,
          photoPath: null,
          faceSamples: samples,
        });

        if (draft.photoBase64) {
          try {
            const path = await uploadStaffPhoto(created.id, draft.photoBase64);
            await updateStaffRequest(created.id, {
              companyId: created.company_id,
              role: created.role,
              authorizedFloors: created.authorized_floors,
              accessStatus: created.access_status,
              photoPath: path,
            });
            await refresh();
          } catch {
            snackbar.show('Staff added, but the profile picture could not be uploaded.', {
              variant: 'info',
            });
          }
        }

        setStaffModal(null);
        setEnrollment(null);
        setTab('staff');
        snackbar.show(
          samples.length > 0
            ? `${created.full_name} added and face registered`
            : `${created.full_name} added as a guest`,
          { variant: 'success' },
        );
      } catch (error) {
        snackbar.show(errorMessage(error, 'The staff member could not be saved.'), {
          variant: 'error',
          duration: 6000,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [createStaff, refresh, snackbar],
  );

  const handleCreateDraft = useCallback(
    (draft: StaffDraft) => {
      if (draft.role === 'Guest') {
        void submitDraft(draft, []);
        return;
      }
      setStaffModal(null);
      setEnrollment({ kind: 'create', draft });
    },
    [submitDraft],
  );

  const handleEnrollmentComplete = useCallback(
    async (samples: FaceSamplePayload[]) => {
      if (!enrollment) return;

      if (enrollment.kind === 'reenrol') {
        setSubmitting(true);
        try {
          await enrollFace(enrollment.member.id, samples);
          snackbar.show(`Face re-registered for ${enrollment.member.full_name}`, {
            variant: 'success',
          });
          setEnrollment(null);
        } catch (error) {
          snackbar.show(errorMessage(error, 'The face could not be enrolled.'), {
            variant: 'error',
            duration: 6000,
          });
        } finally {
          setSubmitting(false);
        }
        return;
      }

      await submitDraft(enrollment.draft, samples);
    },
    [enrollFace, enrollment, snackbar, submitDraft],
  );

  if (!profile) return null;

  if (!isAdmin) {
    return (
      <Screen scroll={false} contentStyle={styles.fallback}>
        <HintRow tone="danger" title="No admin access">
          This account is not an administrator. Ask facilities to update your role, then sign in
          again.
        </HintRow>
        <GeneralButton
          label="Log out"
          icon="logout"
          variant="danger"
          fullWidth
          onPress={() => void signOut()}
        />
      </Screen>
    );
  }

  if (enrollment) {
    return (
      <FaceEnrollmentScreen
        personName={
          enrollment.kind === 'create' ? enrollment.draft.fullName : enrollment.member.full_name
        }
        submitting={submitting}
        onComplete={({ samples }) => void handleEnrollmentComplete(samples)}
        onCancel={() => {
          if (submitting) return;
          setEnrollment(null);
          snackbar.show(
            enrollment.kind === 'create'
              ? 'Face capture cancelled — the staff member was not created.'
              : 'Face re-registration cancelled.',
            { variant: 'info' },
          );
        }}
      />
    );
  }

  const editingMember = staffModal?.mode === 'edit' ? staffModal.member : undefined;

  return (
    <View style={[styles.root, compact ? styles.rootCompact : styles.rootWide]}>
      <SideBar
        activeSection={tab}
        onNavigate={setTab}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onSignOut={() => void signOut()}
      />

      <View style={styles.content}>
        {tab === 'home' ? <HomeScreen onViewLogs={() => setTab('logs')} /> : null}
        {tab === 'logs' ? <LogsScreen /> : null}
        {tab === 'staff' ? (
          <StaffScreen onCreate={openCreate} onEdit={openEdit} onReenrol={openReenrol} />
        ) : null}
        {tab === 'me' ? <MeScreen /> : null}
      </View>

      <StaffCreateEditModal
        visible={staffModal != null}
        mode={staffModal?.mode ?? 'create'}
        member={editingMember}
        photoUrl={editingMember?.photo_path ? photoUrls[editingMember.photo_path] : null}
        submitting={submitting}
        onClose={() => {
          if (!submitting) setStaffModal(null);
        }}
        onCreate={handleCreateDraft}
        onEdit={(id, patch) => void handleEditSubmit(id, patch)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.white,
  },
  rootWide: {
    flexDirection: 'row',
  },
  rootCompact: {
    flexDirection: 'column',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  content: {
    flex: 1,
    backgroundColor: palette.white,
  },
});

export default AppShell;
