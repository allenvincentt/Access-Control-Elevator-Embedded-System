import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { errorMessage } from '@/lib/errors';
import {
  SCANNER_LINK_SUPPORTED,
  readConnectedScannerCount,
} from '@/services/elevatorService';

const POLL_MS = 20_000;
const RETRY_MS = 60_000;

export type ScannerPresence = {
  supported: boolean;
  reachable: boolean;
  online: number;
  checking: boolean;
  error: string | null;
};

function samePresence(a: ScannerPresence, b: ScannerPresence): boolean {
  return (
    a.supported === b.supported &&
    a.reachable === b.reachable &&
    a.online === b.online &&
    a.checking === b.checking &&
    a.error === b.error
  );
}

const UNSUPPORTED: ScannerPresence = {
  supported: false,
  reachable: false,
  online: 0,
  checking: false,
  error: null,
};

export function useScannerPresence(): ScannerPresence & { refresh: () => void } {
  const [presence, setPresence] = useState<ScannerPresence>(
    SCANNER_LINK_SUPPORTED
      ? { supported: true, reachable: false, online: 0, checking: true, error: null }
      : UNSUPPORTED,
  );

  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const update = useCallback((next: ScannerPresence) => {
    setPresence((current) => (samePresence(current, next) ? current : next));
  }, []);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const check = useCallback(async () => {
    if (!SCANNER_LINK_SUPPORTED || inFlight.current) return;
    inFlight.current = true;
    if (mounted.current) {
      setPresence((current) =>
        current.checking || current.reachable ? current : { ...current, checking: true },
      );
    }

    let nextDelay = POLL_MS;
    try {
      const online = await readConnectedScannerCount();
      if (mounted.current) {
        update({ supported: true, reachable: true, online, checking: false, error: null });
      }
    } catch (caught) {
      nextDelay = RETRY_MS;
      if (mounted.current) {
        update({
          supported: true,
          reachable: false,
          online: 0,
          checking: false,
          error: errorMessage(caught, 'The elevator controller could not be reached.'),
        });
      }
    } finally {
      inFlight.current = false;
      if (mounted.current && AppState.currentState === 'active') {
        clearTimer();
        timer.current = setTimeout(() => void check(), nextDelay);
      }
    }
  }, [clearTimer, update]);

  useEffect(() => {
    mounted.current = true;
    if (!SCANNER_LINK_SUPPORTED) return;

    void check();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check();
        return;
      }
      clearTimer();
    });

    return () => {
      mounted.current = false;
      clearTimer();
      subscription.remove();
    };
  }, [check, clearTimer]);

  return { ...presence, refresh: useCallback(() => void check(), [check]) };
}

export default useScannerPresence;
