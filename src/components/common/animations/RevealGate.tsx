import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const RevealGateContext = createContext(true);
const RevealSettledContext = createContext(true);
const RevealHoldContext = createContext<(() => () => void) | null>(null);

export function RevealGate({ open, children }: { open: boolean; children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const [settled, setSettled] = useState(false);
  const nextSettled = open && (settled || pending === 0);

  if (nextSettled !== settled) setSettled(nextSettled);

  const hold = useCallback(() => {
    setPending((count) => count + 1);
    return () => setPending((count) => count - 1);
  }, []);

  return (
    <RevealHoldContext.Provider value={hold}>
      <RevealGateContext.Provider value={open}>
        <RevealSettledContext.Provider value={nextSettled}>
          {children}
        </RevealSettledContext.Provider>
      </RevealGateContext.Provider>
    </RevealHoldContext.Provider>
  );
}

export function RevealSettled({ settled, children }: { settled: boolean; children: ReactNode }) {
  return <RevealSettledContext.Provider value={settled}>{children}</RevealSettledContext.Provider>;
}

export function useRevealOpen(): boolean {
  return useContext(RevealGateContext);
}

export function useRevealSettled(): boolean {
  return useContext(RevealSettledContext);
}

export function useRevealHold(holding: boolean) {
  const hold = useContext(RevealHoldContext);

  useEffect(() => {
    if (!holding || !hold) return;
    return hold();
  }, [holding, hold]);
}

export function useSettledMount(active: boolean): boolean {
  const [settled, setSettled] = useState(false);
  const [wasActive, setWasActive] = useState(active);

  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setSettled(false);
  }

  useEffect(() => {
    if (!active || settled) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [active, settled]);

  return settled;
}
