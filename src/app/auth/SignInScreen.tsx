import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScannerFlow } from "@/app/auth/scanner-screens/ScannerFlow";
import { HintRow } from "@/components/HintRow";
import { useSnackbar } from "@/components/common/Snackbar";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import {
  brandGradient,
  colors,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SignInScreen() {
  const { signIn } = useAuth();
  const snackbar = useSnackbar();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const trimmedEmail = email.trim();
  const emailError = submitted
    ? !trimmedEmail
      ? "Enter your email."
      : !EMAIL_PATTERN.test(trimmedEmail)
        ? "Enter a valid email address."
        : null
    : null;
  const passwordError = submitted && !password ? "Enter your password." : null;

  const handleSubmit = async () => {
    setSubmitted(true);
    setAttempts((count) => count + 1);
    setFormError(null);

    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail) || !password) {
      return;
    }

    setBusy(true);
    try {
      await signIn(trimmedEmail, password);
      setEmail("");
      setPassword("");
    } catch (error) {
      const message = errorMessage(error, "Sign in failed. Try again.");
      setFormError(message);
      snackbar.show(message, { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (scanning) {
    return <ScannerFlow onExit={() => setScanning(false)} />;
  }

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View
            style={[styles.hero, { paddingTop: insets.top + spacing["2xl"] }]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                brandGradient(palette.red, palette.redDeep),
              ]}
            />
            <View style={styles.heroGlow} />
            <View style={styles.plaque}>
              <Logo size={60} rounded />
            </View>
            <Text style={styles.brand}>Elevator System</Text>
            <Text style={styles.tagline}>Secure elevator access control</Text>
            <View style={styles.accentRule} />
          </View>

          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
          >
            <View style={styles.grabber} />

            <View style={styles.headingBlock}>
              <Text style={styles.headingAccent}>Sign In</Text>
            </View>

            <View style={styles.form}>
              <Input
                label="Email"
                type="email"
                icon="mail"
                value={email}
                onChangeText={setEmail}
                error={emailError}
                errorSignal={attempts}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                editable={!busy}
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholder="you@example.com"
              />
              <Input
                ref={passwordRef}
                label="Password"
                type="password"
                icon="lock"
                value={password}
                onChangeText={setPassword}
                error={passwordError}
                errorSignal={attempts}
                returnKeyType="go"
                editable={!busy}
                onSubmitEditing={handleSubmit}
              />

              <View style={styles.rowEnd}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => setScanning(true)}
                >
                  <Text style={styles.link}>Go to Scanning →</Text>
                </Pressable>
              </View>

              {formError ? (
                <HintRow tone="danger" title="Sign in failed">
                  {formError}
                </HintRow>
              ) : null}

              <GeneralButton
                label={busy ? "Signing in…" : "Sign In"}
                size="lg"
                fullWidth
                loading={busy}
                disabled={busy}
                onPress={handleSubmit}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.red,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing["4xl"],
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    top: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: palette.gold,
    opacity: 0.16,
    pointerEvents: "none",
  },
  plaque: {
    width: 92,
    height: 92,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  brand: {
    color: colors.onDark,
    ...typography.title,
    marginTop: spacing.base,
  },
  tagline: {
    color: "rgba(255,255,255,0.82)",
    ...typography.body,
    marginTop: spacing.xs,
  },
  accentRule: {
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
    marginTop: spacing.base,
  },
  sheet: {
    flexGrow: 1,
    marginTop: -spacing["2xl"],
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius["3xl"],
    borderTopRightRadius: radius["3xl"],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xl,
  },
  headingBlock: {
    marginBottom: spacing.xl,
  },
  headingTop: {
    color: colors.text,
    ...typography.title,
  },
  headingAccent: {
    color: colors.primary,
    ...typography.title,
  },
  form: {
    gap: spacing.base,
  },
  rowEnd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  link: {
    color: colors.primary,
    ...typography.label,
  },
  note: {
    marginTop: spacing["2xl"],
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  noteHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  noteTitle: {
    color: colors.textSecondary,
    ...typography.overline,
    letterSpacing: 0.6,
  },
  noteBody: {
    color: colors.textMuted,
    ...typography.caption,
    lineHeight: 17,
  },
});

export default SignInScreen;
