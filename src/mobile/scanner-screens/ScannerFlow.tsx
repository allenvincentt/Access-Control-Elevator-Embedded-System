import { useCallback, useState } from 'react';

import { BarcodeScannerScreen } from '@/app/auth/scanner-screens/BarcodeScannerScreen';
import { DoorReleaseScreen } from '@/app/auth/scanner-screens/DoorReleaseScreen';
import { FacialRecognitionScreen } from '@/app/auth/scanner-screens/FacialRecognitionScreen';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
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

  const notice =
    riders > 0 ? (
      <>
        <HintRow tone="success" title={`${riders} verified · door held open`}>
          {phase === 'boarding'
            ? 'Scan the next badge, or pick a floor in the car and press the door close button to start the occupancy check.'
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
    <BarcodeScannerScreen onVerified={handleVerified} onExit={onExit} notice={notice} />
  );
}

export default ScannerFlow;
