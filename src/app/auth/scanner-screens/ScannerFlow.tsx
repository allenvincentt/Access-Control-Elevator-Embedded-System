import { useCallback, useState } from 'react';

import { BarcodeScannerScreen } from '@/app/auth/scanner-screens/BarcodeScannerScreen';
import { FacialRecognitionScreen } from '@/app/auth/scanner-screens/FacialRecognitionScreen';
import { FloorSelectScreen } from '@/app/auth/scanner-screens/FloorSelectScreen';
import { cancelVerificationSession } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type VerificationSession = {
  token: string;
  expiresAt: string;
  staffName: string;
  companyId: string;
};

type Stage =
  | { step: 'barcode' }
  | { step: 'face'; session: VerificationSession }
  | { step: 'floor'; session: VerificationSession; floors: FloorKey[] };

export type ScannerFlowProps = {
  onExit: () => void;
};

export function ScannerFlow({ onExit }: ScannerFlowProps) {
  const [stage, setStage] = useState<Stage>({ step: 'barcode' });

  const reset = useCallback(() => setStage({ step: 'barcode' }), []);

  const handleVerified = useCallback((session: VerificationSession) => {
    setStage({ step: 'face', session });
  }, []);

  const handleFacePassed = useCallback((floors: FloorKey[]) => {
    setStage((current) =>
      current.step === 'face' ? { step: 'floor', session: current.session, floors } : current,
    );
  }, []);

  const handleCancel = useCallback(() => {
    if (stage.step !== 'barcode') {
      void cancelVerificationSession(stage.session.token);
    }
    setStage({ step: 'barcode' });
  }, [stage]);

  if (stage.step === 'barcode') {
    return <BarcodeScannerScreen onVerified={handleVerified} onExit={onExit} />;
  }

  if (stage.step === 'face') {
    return (
      <FacialRecognitionScreen
        session={stage.session}
        onFacePassed={handleFacePassed}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <FloorSelectScreen
      session={stage.session}
      floors={stage.floors}
      onFinished={reset}
      onCancel={handleCancel}
    />
  );
}

export default ScannerFlow;
