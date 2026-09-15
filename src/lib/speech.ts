import * as Speech from 'expo-speech';

const SPEECH_OPTIONS: Speech.SpeechOptions = {
  rate: 1.0,
  pitch: 1.0,
};

function speak(text: string): void {
  Speech.stop();
  Speech.speak(text, SPEECH_OPTIONS);
}

export function announceAccessGranted(): void {
  speak('Access Granted');
}

export function announceAccessDenied(): void {
  speak('Access Denied');
}

/** Speaks a welcome using only the first word of the staff member's full name. */
export function announceWelcome(fullName: string): void {
  const firstName = fullName.trim().split(/\s+/)[0];
  speak(firstName ? `Welcome ${firstName}` : 'Welcome');
}

export function announceGuestCheckedIn(): void {
  speak('Guest checked in');
}

export function announceScanAgain(): void {
  speak('Scan again');
}
