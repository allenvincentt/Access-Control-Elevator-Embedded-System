import { StyleSheet, Text, View } from 'react-native';

import { SignInScreen } from '@/app/auth/SignInScreen';
import { Loading } from '@/components/common/Loading';
import { HintRow } from '@/components/HintRow';
import { AppShell } from '@/components/layout/AppShell';
import { Screen } from '@/components/layout/Screen';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/themeColor';
import { useAuth } from '@/hooks/useAuth';
import { IS_SUPABASE_CONFIGURED, SUPABASE_CONFIG_ERROR } from '@/lib/env';

function ConfigurationScreen() {
  return (
    <Screen scroll={false} bottomClearance={false} contentStyle={styles.centred}>
      <View style={styles.iconWrap}>
        <Icon name="settings" size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>Backend not configured</Text>
      <Text style={styles.body}>
        The app cannot reach Supabase because its environment variables are missing or invalid.
      </Text>
      <HintRow tone="danger" title="What to fix">
        {SUPABASE_CONFIG_ERROR ?? 'Unknown configuration problem.'}
      </HintRow>
    </Screen>
  );
}

export default function Index() {
  const { status, isAuthenticated } = useAuth();

  if (!IS_SUPABASE_CONFIGURED) {
    return <ConfigurationScreen />;
  }

  if (status === 'loading') {
    return (
      <Screen scroll={false} bottomClearance={false} contentStyle={styles.centred}>
        <Loading label="Restoring your session…" />
      </Screen>
    );
  }

  return isAuthenticated ? <AppShell /> : <SignInScreen />;
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  title: {
    color: colors.text,
    ...typography.title,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
