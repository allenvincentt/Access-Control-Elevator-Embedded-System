import { BlurTargetView } from 'expo-blur';
import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  return (
    <BlurTargetContext.Provider value={ref}>
      <BlurTargetView ref={ref} style={styles.fill}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

export function useBlurTarget(): RefObject<View | null> | null {
  return useContext(BlurTargetContext);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
