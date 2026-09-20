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

export function announceBoardingHold(expected: number): void {
  const who = expected === 1 ? 'One person verified' : `${expected} people verified`;
  speak(`${who}. The door is held open. Pick a floor, then press the door close button.`);
}

export function announceOccupancyMismatch(expected: number, observed: number): void {
  if (observed > expected) {
    const extra = observed - expected;
    speak(
      extra === 1
        ? 'There is one more person than verified. Please step out, then close the door again.'
        : `There are ${extra} more people than verified. Please step out, then close the door again.`,
    );
    return;
  }

  const missing = Math.max(1, expected - observed);
  speak(
    missing === 1
      ? 'One verified person is missing. Please step in, then close the door again.'
      : `${missing} verified people are missing. Please step in, then close the door again.`,
  );
}

export function announceDetectorOffline(): void {
  speak('The occupancy detector is offline. The door is opening again.');
}

export function announceRideCancelled(): void {
  speak('Verification cancelled. Please scan again.');
}

export function announcePickFloor(): void {
  speak('Select a floor before closing the door.');
}

export function announceHoldExpired(): void {
  speak('Door hold expired. Closing the door and checking the car.');
}

export function announceRideCleared(): void {
  speak('Occupancy verified. Travelling now.');
}
