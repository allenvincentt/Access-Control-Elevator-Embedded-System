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
  speak(`${who}. The door is held open. Press your floor button now.`);
}

export function announceOccupancyMismatch(expected: number, observed: number): void {
  if (observed > expected) {
    const extra = observed - expected;
    speak(
      extra === 1
        ? 'There is one more person than verified. Counting again.'
        : `There are ${extra} more people than verified. Counting again.`,
    );
    return;
  }

  const missing = Math.max(1, expected - observed);
  speak(
    missing === 1
      ? 'One verified person is missing. Counting again.'
      : `${missing} verified people are missing. Counting again.`,
  );
}

export function announceDetectorOffline(): void {
  speak('The occupancy detector is offline. Counting again.');
}

export function announceRideCancelled(): void {
  speak('Verification cancelled. Please scan again.');
}

export function announcePickFloor(): void {
  speak('Select a floor before closing the door.');
}

export function announceWrongFloor(): void {
  speak('Wrong floor. This ride is locked to another floor. Please step out.');
}

export function announceFaceCheck(): void {
  speak('Door closed. Each rider, please face the camera to confirm your identity.');
}

export function announceFaceFailed(): void {
  speak('Face verification failed. The ride is cancelled and the door is opening.');
}

export function announceHoldExpired(): void {
  speak('Door hold expired. Closing the door and checking the car.');
}

export function announceRideCleared(): void {
  speak('Occupancy verified. Travelling now.');
}
