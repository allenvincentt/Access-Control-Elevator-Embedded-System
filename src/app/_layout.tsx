import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { SnackbarProvider } from '@/components/common/Snackbar';
import { colors } from '@/constants/themeColor';
import { AuthProvider } from '@/hooks/useAuth';
import { BlurTargetProvider } from '@/hooks/useBlurTarget';
import { StaffProvider } from '@/hooks/useStaff';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    MaterialSymbols: require('@expo-google-fonts/material-symbols/400Regular/MaterialSymbols_400Regular.ttf'),
    PlusJakartaSans_500Medium: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SnackbarProvider>
        <AuthProvider>
          <StaffProvider>
            <StatusBar style="dark" />
            <BlurTargetProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  animation: 'none',
                }}
              />
            </BlurTargetProvider>
          </StaffProvider>
        </AuthProvider>
      </SnackbarProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
