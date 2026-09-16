import { BlurTargetView } from 'expo-blur';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';

type BlurTargetContextValue = {
  target: RefObject<View | null>;
  bind: (view: View | null) => void;
};

const BlurTargetContext = createContext<BlurTargetContextValue | null>(null);

export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View | null>(null);
  const value = useMemo<BlurTargetContextValue>(
    () => ({ target: { current: view }, bind: setView }),
    [view],
  );
  return <BlurTargetContext.Provider value={value}>{children}</BlurTargetContext.Provider>;
}

export function BlurTargetSurface({ children }: { children: ReactNode }) {
  const bind = useContext(BlurTargetContext)?.bind;
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!bind) return;
    bind(ref.current);
    return () => bind(null);
  }, [bind]);

  return (
    <BlurTargetView ref={ref} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

export function useBlurTarget(): RefObject<View | null> | null {
  return useContext(BlurTargetContext)?.target ?? null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
