import { CameraView } from "expo-camera";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { VerificationSession } from "@/app/auth/scanner-screens/ScannerFlow";
import { useSnackbar } from "@/components/common/Snackbar";
import { HintRow } from "@/components/HintRow";
import { CameraPermissionGate } from "@/components/scanner/CameraPermissionGate";
import {
  ScannerOverlay,
  type ScannerStatus,
} from "@/components/scanner/ScannerOverlay";
import { ScannerScaffold } from "@/components/scanner/ScannerScaffold";
import { GeneralButton } from "@/components/ui/buttons/GeneralButton";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { ShakeView } from "@/components/ui/ShakeView";
import { colors, spacing, typography } from "@/constants/themeColor";
import { getDeviceId } from "@/lib/deviceId";
import { DENIAL_MESSAGES, errorMessage } from "@/lib/errors";
import { announceAccessDenied, announceAccessGranted } from "@/lib/speech";
import { verifyBarcode } from "@/services/verificationService";

export type BarcodeScannerScreenProps = {
  onVerified: (session: VerificationSession) => void;
  onExit: () => void;
};

const RESCAN_COOLDOWN_MS = 1500;
const DENIAL_HOLD_MS = 2600;

const CAPTIONS: Record<ScannerStatus, string> = {
  idle: "Point the camera at your access barcode",
  scanning: "Align the barcode inside the frame",
  verifying: "Checking your access barcode…",
  error: "Barcode not accepted",
  success: "Barcode verified",
};

const HINTS = [
  "Hold the phone 15–20 cm away so the whole barcode is inside the frame.",
  "Make sure there is enough light and the barcode is not creased or glare-covered.",
  "Use the ID barcode issued by facilities — personal QR codes are not accepted.",
];

export function BarcodeScannerScreen({
  onVerified,
  onExit,
}: BarcodeScannerScreenProps) {
  const snackbar = useSnackbar();

  const [status, setStatus] = useState<ScannerStatus>("scanning");
  const [attempts, setAttempts] = useState(0);
  const [denial, setDenial] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const mounted = useRef(true);
  const rearmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (rearmTimer.current) clearTimeout(rearmTimer.current);
    };
  }, []);

  const rearmAfterDenial = useCallback(() => {
    if (rearmTimer.current) clearTimeout(rearmTimer.current);
    rearmTimer.current = setTimeout(() => {
      if (!mounted.current) return;
      lastScan.current = null;
      setDenial(null);
      setStatus("scanning");
    }, DENIAL_HOLD_MS);
  }, []);

  const runVerification = useCallback(
    async (raw: string) => {
      if (rearmTimer.current) clearTimeout(rearmTimer.current);
      setStatus("verifying");
      setDenial(null);

      try {
        const deviceId = await getDeviceId();
        const result = await verifyBarcode(raw, deviceId);
        if (!mounted.current) return;

        if (result.ok) {
          setStatus("success");
          announceAccessGranted();
          snackbar.show(`Badge verified — ${result.staff.full_name}`, {
            variant: "success",
          });
          setTimeout(() => {
            if (!mounted.current) return;
            onVerified({
              token: result.session_token,
              expiresAt: result.expires_at,
              staffName: result.staff.full_name,
              companyId: result.staff.company_id,
              role: result.staff.role,
            });
          }, 600);
          return;
        }

        setStatus("error");
        setAttempts((count) => count + 1);
        setDenial(DENIAL_MESSAGES[result.reason]);
        announceAccessDenied();
        snackbar.show(DENIAL_MESSAGES[result.reason], { variant: "error" });
        rearmAfterDenial();
      } catch (error) {
        if (!mounted.current) return;
        setStatus("error");
        setAttempts((count) => count + 1);
        const message = errorMessage(
          error,
          "The barcode could not be checked.",
        );
        setDenial(message);
        announceAccessDenied();
        snackbar.show(message, { variant: "error" });
        rearmAfterDenial();
      }
    },
    [onVerified, rearmAfterDenial, snackbar],
  );

  const handleScan = useCallback(
    (data: string) => {
      if (status !== "scanning") return;

      const code = data.trim().toUpperCase();
      const now = Date.now();
      if (
        lastScan.current &&
        lastScan.current.code === code &&
        now - lastScan.current.at < RESCAN_COOLDOWN_MS
      ) {
        return;
      }
      lastScan.current = { code, at: now };
      void runVerification(code);
    },
    [runVerification, status],
  );

  const hint = HINTS[Math.min(attempts, HINTS.length - 1)];

  return (
    <CameraPermissionGate
      icon="qr"
      title="Camera access needed"
      reason="Elevator System needs the camera to scan the access barcode before you can continue to face verification."
    >
      <ScannerScaffold
        step="Step 1 of 3"
        title="Scan access barcode"
        subtitle="Staff access verification"
        onExit={onExit}
        exitIcon="back"
        exitLabel="Back to sign in"
        centerPanel={manualOpen}
        camera={
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              active={!manualOpen}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "qr",
                  "code128",
                  "code39",
                  "ean13",
                  "ean8",
                  "pdf417",
                  "upc_a",
                ],
              }}
              onBarcodeScanned={
                status === "scanning"
                  ? (result) => handleScan(result.data)
                  : undefined
              }
            />
            <ScannerOverlay
              shape="square"
              status={status}
              caption={CAPTIONS[status]}
            />
          </>
        }
        panel={
          <ShakeView signal={attempts} style={styles.panelStack}>
            {status === "error" ? (
              <>
                <View style={styles.panelHead}>
                  <Icon name="error" size={20} color={colors.danger} />
                  <Text style={styles.panelTitle}>Access denied</Text>
                </View>
                <HintRow tone="danger" title="Why">
                  {denial ?? "That badge could not be verified."}
                </HintRow>
                <HintRow tone="warning" title="Helpful hint">
                  {hint}
                </HintRow>
                <Text style={styles.panelBody}>
                  Scanning restarts automatically — hold the badge up again.
                </Text>
              </>
            ) : status === "success" ? (
              <>
                <View style={styles.panelHead}>
                  <Icon name="checkCircle" size={20} color={colors.success} />
                  <Text style={styles.panelTitle}>Barcode verified</Text>
                </View>
                <Text style={styles.panelBody}>
                  Continuing to face verification…
                </Text>
              </>
            ) : (
              <>
                <View style={styles.panelHead}>
                  <Icon name="qr" size={20} color={colors.primary} />
                  <Text style={styles.panelTitle}>
                    {status === "verifying" ? "Verifying…" : "Ready to scan"}
                  </Text>
                </View>
                <Text style={styles.panelBody}>
                  Keep the barcode flat and centred. Verification starts
                  automatically.
                </Text>
  
                {manualOpen ? (
                  <View style={styles.manual}>
                    <Input
                      label="Company ID"
                      icon="badge"
                      type="password"
                      value={manualCode}
                      onChangeText={(text) => setManualCode(text.toUpperCase())}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={status !== "verifying"}
                      returnKeyType="go"
                      onSubmitEditing={() => void runVerification(manualCode)}
                    />
                    <View style={styles.manualRow}>
                      <GeneralButton
                        label="Cancel"
                        size="sm"
                        variant="ghost"
                        onPress={() => setManualOpen(false)}
                        style={styles.manualBtn}
                        disabled={status === "verifying"}
                      />
                      <GeneralButton
                        label="Verify"
                        size="sm"
                        icon="check"
                        onPress={() => void runVerification(manualCode)}
                        style={styles.manualBtn}
                        disabled={
                          status === "verifying" || manualCode.trim().length < 3
                        }
                      />
                    </View>
                  </View>
                ) : (
                  <GeneralButton
                    label="Enter company ID manually"
                    size="sm"
                    variant="ghost"
                    icon="badge"
                    onPress={() => setManualOpen(true)}
                    disabled={status === "verifying"}
                  />
                )}
              </>
            )}
          </ShakeView>
        }
      />
    </CameraPermissionGate>
  );
}

const styles = StyleSheet.create({
  panelStack: {
    gap: spacing.md,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  panelBody: {
    color: colors.textSecondary,
    ...typography.body,
  },
  manual: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manualRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  manualBtn: {
    flex: 1,
  },
});

export default BarcodeScannerScreen;
