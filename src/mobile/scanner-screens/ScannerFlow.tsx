import { useCallback, useEffect, useRef, useState } from 'react';

import { BarcodeScannerScreen } from '@/mobile/scanner-screens/BarcodeScannerScreen';
import { DoorReleaseScreen } from '@/mobile/scanner-screens/DoorReleaseScreen';
import { FacialRecognitionScreen } from '@/mobile/scanner-screens/FacialRecognitionScreen';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { floorShortLabel } from '@/constants/floors';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { useRideNarration } from '@/hooks/useRideNarration';
import { useRideSession } from '@/hooks/useRideSession';
import { errorMessage } from '@/lib/errors';
import { abandonRide, confirmFaces, failFaces, markFaceVerified } from '@/services/rideSession';
import type { FloorKey, StaffRoleKey } from '@/types/database';

export type VerificationSession = {
  token: string;
  expiresAt: string;
  staffName: string;
  companyId: string;
  role: StaffRoleKey;
};

type Stage =
  | { step: 'barcode' }
  | { step: 'door'; session: VerificationSession; floors: FloorKey[] };

export type ScannerFlowProps = {
  onExit: () => void;
};

export function ScannerFlow({ onExit }: ScannerFlowProps) {
  const snackbar = useSnackbar();
  const ride = useRideSession();
  const [stage, setStage] = useState<Stage>({ step: 'barcode' });
  const confirmSent = useRef(false);

  const verifying = ride.riders.length > 0 && ride.boarding?.phase === 'verifying';
  const pendingFace = verifying ? (ride.riders.find((rider) => !rider.faceVerified) ?? null) : null;

  useRideNarration(ride.boarding, stage.step === 'barcode');

  useEffect(() => {
    if (!verifying) {
      confirmSent.current = false;
      return;
    }
    if (pendingFace || confirmSent.current) return;
    confirmSent.current = true;
    confirmFaces().catch((error) => {
      confirmSent.current = false;
      snackbar.show(errorMessage(error, 'The controller did not take the face check result.'), {
        variant: 'error',
      });
    });
  }, [pendingFace, ride.boarding, snackbar, verifying]);

  const handleVerified = useCallback((session: VerificationSession, floors: FloorKey[]) => {
    setStage({ step: 'door', session, floors });
  }, []);

  const handleBackToBarcode = useCallback(() => {
    setStage({ step: 'barcode' });
  }, []);

  const handleFacePassed = useCallback(() => {
    if (pendingFace) markFaceVerified(pendingFace.token);
  }, [pendingFace]);

  const handleFaceFailed = useCallback(() => {
    void failFaces();
    snackbar.show('Face check failed. The ride is cancelled and the door is opening.', {
      variant: 'error',
    });
  }, [snackbar]);

  const handleAbandon = useCallback(() => {
    void abandonRide();
    snackbar.show('Ride cancelled. The group must scan again.', { variant: 'info' });
  }, [snackbar]);

  if (stage.step === 'door') {
    return (
      <DoorReleaseScreen
        session={stage.session}
        floors={stage.floors}
        onReleased={handleBackToBarcode}
        onCancel={handleBackToBarcode}
      />
    );
  }

  if (pendingFace) {
    return (
      <FacialRecognitionScreen
        key={pendingFace.token}
        session={{
          token: pendingFace.token,
          expiresAt: pendingFace.expiresAt,
          staffName: pendingFace.name,
          companyId: pendingFace.companyId,
          role: pendingFace.role,
        }}
        onFacePassed={handleFacePassed}
        onCancel={handleFaceFailed}
      />
    );
  }

  const riders = ride.riders.length;
  const phase = ride.boarding?.phase ?? 'idle';
  const lockedFloor = ride.boarding?.lockedFloor ?? null;
  const locked = riders > 0 && phase === 'boarding' && ride.boarding?.awaitingFloor === true;

  const notice =
    riders > 0 ? (
      <>
        {locked ? (
          <HintRow tone="warning" title="Scanner locked">
            {lockedFloor
              ? `Rider ${riders} must press ${floorShortLabel(lockedFloor)} inside the car before the next badge can be scanned. Any other floor rejects them.`
              : 'Press a floor button inside the car. That floor becomes the destination for everyone on this ride.'}
          </HintRow>
        ) : null}
        <HintRow
          tone="success"
          title={`${riders} badge${riders === 1 ? '' : 's'} scanned${lockedFloor ? ` · ${floorShortLabel(lockedFloor)} only` : ''}`}
        >
          {phase === 'boarding'
            ? lockedFloor
              ? `Anyone joining must be cleared for ${floorShortLabel(lockedFloor)} and press it. Or press the door close button to start the face check.`
              : 'Waiting for the first floor to be picked.'
            : phase === 'verifying'
              ? 'The door is closed. Faces are confirmed and handed to the occupancy check.'
              : phase === 'counting'
              ? 'Faces confirmed. The door is closed and the car is being counted.'
              : 'The controller is finishing this ride.'}
        </HintRow>
        <GeneralButton
          label="Cancel this ride"
          size="sm"
          variant="ghost"
          icon="close"
          onPress={handleAbandon}
        />
      </>
    ) : null;

  return (
    <BarcodeScannerScreen
      onVerified={handleVerified}
      onExit={onExit}
      notice={notice}
      locked={locked}
      requiredFloor={riders > 0 && phase === 'boarding' ? lockedFloor : null}
    />
  );
}

export default ScannerFlow;
