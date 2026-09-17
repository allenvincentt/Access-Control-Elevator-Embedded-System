import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextInput,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScannerFlow } from "@/app/auth/scanner-screens/ScannerFlow";
import { HintRow } from "@/components/HintRow";
import { useSnackbar } from "@/components/common/Snackbar";
import { Input } from "@/components/ui/Input";
import {
  SignInCharacter,
  type CharacterMood,
} from "@/components/ui/SignInCharacter";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import {
  brandGradient,
  colors,
  layout,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from "@/constants/themeColor";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { errorMessage } from "@/lib/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPING_IDLE_MS = 900;
const REACTION_MS = 2200;
const CHARACTER_SIZE = 148;
const CHARACTER_SIZE_DESKTOP = 168;
const CHARACTER_RATIO = 112 / 120;
const COMPACT_SCALE = 0.58;
const COMPACT_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };
const WELCOME_LINE_DESKTOP = 40;
const DESKTOP_CARD_WIDTH = 460;
const FORM_MAX_WIDTH = 440;

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
  const [activeField, setActiveField] = useState<"email" | "password" | null>(
    null,
  );
  const [typing, setTyping] = useState(false);
  const [reaction, setReaction] = useState<"success" | "error" | null>(null);
  const [linkHovered, setLinkHovered] = useState(false);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
    },
    [],
  );

  const markTyping = useCallback(() => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
  }, []);

  const react = useCallback((next: "success" | "error") => {
    setReaction(next);
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_MS);
  }, []);

  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;
  const keyboardInset = Math.max(0, keyboardHeight - insets.bottom);

  const { width: windowWidth } = useWindowDimensions();
  const desktop = windowWidth >= layout.compactNavigation;
  const characterSize = desktop ? CHARACTER_SIZE_DESKTOP : CHARACTER_SIZE;
  const characterHeight = Math.round(characterSize * CHARACTER_RATIO);
  const welcomeLine = desktop
    ? WELCOME_LINE_DESKTOP
    : typography.display.lineHeight;

  const compact = useSharedValue(0);

  useEffect(() => {
    compact.value = withTiming(keyboardOpen ? 1 : 0, COMPACT_TIMING);
  }, [keyboardOpen, compact]);

  const heroStyle = useAnimatedStyle(() => ({
    paddingTop: insets.top + spacing["2xl"] - (spacing["2xl"] - spacing.md) * compact.value,
    paddingBottom: spacing["4xl"] - (spacing["4xl"] - spacing.xl) * compact.value,
  }));

  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: 1 - compact.value,
    height: welcomeLine * (1 - compact.value),
    marginBottom: spacing.xl * (1 - compact.value),
    transform: [{ translateY: -8 * compact.value }],
  }));

  const characterStyle = useAnimatedStyle(() => ({
    height: characterHeight * (1 - (1 - COMPACT_SCALE) * compact.value),
    transform: [{ scale: 1 - (1 - COMPACT_SCALE) * compact.value }],
  }));

  const mood: CharacterMood = busy
    ? "loading"
    : reaction
      ? reaction
      : activeField === "password"
        ? typing
          ? "passwordTyping"
          : "password"
        : activeField === "email"
          ? typing
            ? "emailTyping"
            : "email"
          : "idle";

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
      react("error");
      return;
    }

    setBusy(true);
    try {
      await signIn(trimmedEmail, password);
      setEmail("");
      setPassword("");
      react("success");
    } catch (error) {
      const message = errorMessage(error, "Sign in failed. Try again.");
      setFormError(message);
      snackbar.show(message, { variant: "error" });
      react("error");
    } finally {
      setBusy(false);
    }
  };

  if (scanning) {
    return <ScannerFlow onExit={() => setScanning(false)} />;
  }

  const heroBlock = (
    <>
      <Animated.Text
        style={[styles.welcome, desktop && styles.welcomeDesktop, welcomeStyle]}
        numberOfLines={1}
      >
        Welcome back!
      </Animated.Text>
      <Animated.View style={[styles.character, characterStyle]}>
        <SignInCharacter mood={mood} size={characterSize} />
      </Animated.View>
    </>
  );

  const formBlock = (
    <View style={styles.formColumn}>
      <View style={styles.headingBlock}>
        <Text style={styles.headingAccent}>Sign In</Text>
      </View>

      <View style={styles.form}>
              <Input
                label="Email"
                type="email"
                icon="mail"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  markTyping();
                }}
                error={emailError}
                errorSignal={attempts}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                editable={!busy}
                onFocus={() => setActiveField("email")}
                onBlur={() =>
                  setActiveField((current) =>
                    current === "email" ? null : current,
                  )
                }
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholder="you@example.com"
              />
              <Input
                ref={passwordRef}
                label="Password"
                type="password"
                icon="lock"
                value={password}
                onChangeText={(next) => {
                  setPassword(next);
                  markTyping();
                }}
                error={passwordError}
                errorSignal={attempts}
                returnKeyType="go"
                editable={!busy}
                onFocus={() => setActiveField("password")}
                onBlur={() =>
                  setActiveField((current) =>
                    current === "password" ? null : current,
                  )
                }
                onSubmitEditing={handleSubmit}
              />

        <View style={styles.rowEnd}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            disabled={busy}
            onPress={() => setScanning(true)}
            onHoverIn={() => setLinkHovered(true)}
            onHoverOut={() => setLinkHovered(false)}
          >
            <Text style={[styles.link, linkHovered && styles.linkHovered]}>
              Go to Scanning →
            </Text>
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
  );

  if (desktop) {
    return (
      <View style={styles.rootDesktop}>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHero}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  brandGradient(palette.red, palette.redDeep),
                ]}
              />
              {heroBlock}
            </View>

            <View style={styles.modalSheet}>{formBlock}</View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.flex, { paddingBottom: keyboardInset }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={[styles.hero, heroStyle]}>
            <View
              style={[
                StyleSheet.absoluteFill,
                brandGradient(palette.red, palette.redDeep),
              ]}
            />
            {heroBlock}
          </Animated.View>

          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
          >
            <View style={styles.grabber} />
            {formBlock}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.red,
  },
  rootDesktop: {
    flex: 1,
    backgroundColor: colors.background,
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
    overflow: "hidden",
  },
  welcome: {
    color: colors.onDark,
    ...typography.display,
    textAlign: "center",
  },
  welcomeDesktop: {
    fontSize: 34,
    lineHeight: WELCOME_LINE_DESKTOP,
  },
  character: {
    alignItems: "center",
    justifyContent: "flex-start",
    transformOrigin: "50% 0%",
  },
  modalScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["4xl"],
  },
  modalCard: {
    width: "100%",
    maxWidth: DESKTOP_CARD_WIDTH,
    borderRadius: radius["3xl"],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.lg,
  },
  modalHero: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing["3xl"],
    paddingBottom: spacing["4xl"],
    overflow: "hidden",
  },
  modalSheet: {
    marginTop: -spacing["2xl"],
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius["3xl"],
    borderTopRightRadius: radius["3xl"],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing["2xl"],
    paddingBottom: spacing["2xl"],
  },
  formColumn: {
    width: "100%",
    maxWidth: FORM_MAX_WIDTH,
    alignSelf: "center",
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
  linkHovered: {
    color: palette.redPressed,
    textDecorationLine: "underline",
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
