import { useEffect, useRef } from 'react';

import {
  announceDetectorOffline,
  announceHoldExpired,
  announceOccupancyMismatch,
  announcePickFloor,
  announceRideCancelled,
  announceRideCleared,
} from '@/lib/speech';
import type { BoardingStatus, RidePhase } from '@/services/elevatorService';

export function useRideNarration(boarding: BoardingStatus | null, enabled: boolean) {
  const lastSeq = useRef<number | null>(null);
  const lastPhase = useRef<RidePhase | null>(null);

  useEffect(() => {
    if (!enabled || !boarding) return;

    if (lastSeq.current === null) {
      lastSeq.current = boarding.faultSeq;
      lastPhase.current = boarding.phase;
      return;
    }

    if (boarding.faultSeq !== lastSeq.current) {
      lastSeq.current = boarding.faultSeq;
      if (boarding.fault === 'mismatch') {
        announceOccupancyMismatch(boarding.expected, boarding.observed);
      } else if (boarding.fault === 'offline') {
        announceDetectorOffline();
      } else if (boarding.fault === 'cancelled') {
        announceRideCancelled();
      } else if (boarding.fault === 'no_floor') {
        announcePickFloor();
      } else if (boarding.fault === 'hold_expired') {
        announceHoldExpired();
      }
    }

    if (boarding.phase !== lastPhase.current) {
      if (boarding.phase === 'cleared' && lastPhase.current === 'counting') {
        announceRideCleared();
      }
      lastPhase.current = boarding.phase;
    }
  }, [boarding, enabled]);
}

export default useRideNarration;
