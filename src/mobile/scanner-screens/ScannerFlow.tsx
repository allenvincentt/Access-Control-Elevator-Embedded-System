import { useCallback, useState } from 'react';

import { BarcodeScannerScreen } from '@/mobile/scanner-screens/BarcodeScannerScreen';
import { DoorReleaseScreen } from '@/mobile/scanner-screens/DoorReleaseScreen';
import { FacialRecognitionScreen } from '@/mobile/scanner-screens/FacialRecognitionScreen';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { floorShortLabel } from '@/constants/floors';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { useRideNarration } from '@/hooks/useRideNarration';
import { useRideSession } from '@/hooks/useRideSession';
import { abandonRide } from '@/services/rideSession';
import { cancelVerificationSession } from '@/services/verificationService';
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
  | { step: 'face'; session: VerificationSession }
  | { step: 'door'; session: VerificationSession; floors: FloorKey[] };

export type ScannerFlowProps = {
  onExit: () => void;
};

export function ScannerFlow({ onExit }: ScannerFlowProps) {
  const snackbar = useSnackbar();
  const ride = useRideSession();
  const [stage, setStage] = useState<Stage>({ step: 'barcode' });

  useRideNarration(ride.boarding, stage.step === 'barcode');

  const handleVerified = useCallback((session: VerificationSession) => {
    setStage({ step: 'face', session });
  }, []);

  const handleFacePassed = useCallback((floors: FloorKey[]) => {
    setStage((current) =>
      current.step === 'face' ? { step: 'door', session: current.session, floors } : current,
    );
  }, []);

  const handleCancel = useCallback(() => {
    if (stage.step === 'face') {
      void cancelVerificationSession(stage.session.token);
    }
    setStage({ step: 'barcode' });
  }, [stage]);

  const handleBackToBarcode = useCallback(() => {
    setStage({ step: 'barcode' });
  }, []);

  const handleAbandon = useCallback(() => {
    void abandonRide();
    snackbar.show('Ride cancelled. The group must scan again.', { variant: 'info' });
  }, [snackbar]);

  if (stage.step === 'face') {
    return (
      <FacialRecognitionScreen
        session={stage.session}
        onFacePassed={handleFacePassed}
        onCancel={handleCancel}
      />
    );
  }

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
          title={`${riders} verified · door held open${lockedFloor ? ` · ${floorShortLabel(lockedFloor)} only` : ''}`}
        >
          {phase === 'boarding'
            ? lockedFloor
              ? `Anyone joining must be cleared for ${floorShortLabel(lockedFloor)} and press it. Or press the door close button to start the occupancy check.`
              : 'Waiting for the first floor to be picked.'
            : phase === 'counting'
              ? 'The door is closed and the car is being counted.'
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
