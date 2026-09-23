import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const RevealGateContext = createContext(true);

export function RevealGate({ open, children }: { open: boolean; children: ReactNode }) {
  return <RevealGateContext.Provider value={open}>{children}</RevealGateContext.Provider>;
}

export function useRevealOpen(): boolean {
  return useContext(RevealGateContext);
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
