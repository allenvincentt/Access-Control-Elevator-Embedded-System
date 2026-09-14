#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

static const char *BLE_NAME = "ElevatorTerminal";
static const char *SERVICE_UUID = "6e6c0001-b5a3-f393-e0a9-e50e24dcca9e";
static const char *STATUS_CHAR_UUID = "6e6c0002-b5a3-f393-e0a9-e50e24dcca9e";
static const char *COMMAND_CHAR_UUID = "6e6c0003-b5a3-f393-e0a9-e50e24dcca9e";
static const char *DEVICE_KEY = "Elevator123";

static const uint8_t BUTTON_COUNT = 5;
static const uint8_t BUTTON_DOOR_INDEX = 3;
static const uint8_t BUTTON_EMERGENCY_INDEX = 4;
static const uint8_t PIN_BUTTON[BUTTON_COUNT] = {32, 33, 25, 4, 16};

static const uint8_t PIN_LED_DOOR = 13;
static const uint8_t PIN_MOTOR_IN1 = 26;
static const uint8_t PIN_MOTOR_IN2 = 27;
static const uint8_t PIN_MOTOR_ENA = 14;
static const uint8_t PIN_SERVO_LEFT = 18;
static const uint8_t PIN_SERVO_RIGHT = 19;
static const uint8_t PIN_BUZZER = 23;
static const uint8_t PIN_OLED_SDA = 21;
static const uint8_t PIN_OLED_SCL = 22;

static const uint8_t OLED_WIDTH = 128;
static const uint8_t OLED_HEIGHT = 64;
static const uint8_t OLED_ADDRESS_PRIMARY = 0x3C;
static const uint8_t OLED_ADDRESS_ALTERNATE = 0x3D;
static const uint32_t OLED_I2C_HZ = 100000;

static const char *FLOOR_KEY[3] = {"FirstFloor", "SecondFloor", "ThirdFloor"};
static const char FLOOR_DIGIT[3] = {'1', '2', '3'};
static const char *FLOOR_LABEL[3] = {"MAIN LOBBY", "SECOND FLOOR", "THIRD FLOOR"};
static const uint8_t LOBBY_FLOOR = 0;

static const uint32_t GRANT_WINDOW_MS = 30000;
static const uint32_t DOOR_TRAVEL_MS = 900;
static const uint32_t DOOR_AUTO_CLOSE_MS = 10000;
static const uint32_t INACTIVITY_RETURN_MS = 20000;
static const uint32_t FLOOR_TRAVEL_MS = 1400;
static const uint32_t MOTOR_STOP_DELAY_MS = 700;
static const uint32_t MOTOR_KICK_MS = 150;
static const uint32_t ARRIVAL_CHIME_DELAY_MS = 1000;
static const uint32_t ARROW_FRAME_MS = 220;
static const uint32_t DEBOUNCE_MS = 30;

static const uint32_t MOTOR_PWM_FREQ = 20000;
static const uint8_t MOTOR_PWM_BITS = 8;
static const uint8_t MOTOR_PWM_CHANNEL = 0;
static const uint8_t MOTOR_KICK_DUTY = 255;
static const uint8_t MOTOR_CRUISE_DUTY = 190;

static const uint32_t SERVO_PWM_FREQ = 50;
static const uint8_t SERVO_PWM_BITS = 16;
static const uint8_t SERVO_LEFT_CHANNEL = 4;
static const uint8_t SERVO_RIGHT_CHANNEL = 6;
static const uint32_t SERVO_PERIOD_US = 20000;
static const uint16_t SERVO_US_AT_MIN_DEG = 500;
static const uint16_t SERVO_US_AT_MAX_DEG = 2500;
static const uint8_t SERVO_MAX_DEG = 180;
static const uint8_t DOOR_CLOSED_DEG = 0;
static const uint8_t DOOR_OPEN_DEG = 90;

static const uint32_t BUZZER_PWM_FREQ = 2000;
static const uint8_t BUZZER_PWM_BITS = 10;
static const uint8_t BUZZER_PWM_CHANNEL = 2;

static const uint32_t IDLE_ANIMATION_MS = 5000;
static const uint8_t CREATURE_COLS = 16;
static const uint8_t CREATURE_BODY_ROWS = 11;
static const uint8_t CREATURE_LEG_CELLS = 3;
static const uint8_t CREATURE_ARM_CELLS = 4;
static const uint8_t CREATURE_ARM_ROW = 5;
static const uint8_t CREATURE_PIXEL = 3;
static const uint8_t CREATURE_EYE_ROW = 4;
static const uint8_t CREATURE_LEG_LEFT_COL = 3;
static const uint8_t CREATURE_LEG_RIGHT_COL = 11;
static const uint16_t CREATURE_EYE_MASK = 0x1818;

static const uint8_t CREATURE_WALK_FRAMES = 8;
static const uint32_t CREATURE_FRAME_MS = 120;
static const uint32_t CREATURE_WALK_MS = 4800;
static const uint32_t CREATURE_WAVE_MS = 1440;
static const uint32_t CREATURE_BLINK_INTERVAL_MS = 3600;
static const uint32_t CREATURE_BLINK_MS = 150;
static const uint32_t CREATURE_GAZE_MS = 1500;

static const uint8_t ARM_DOWN = 0;
static const uint8_t ARM_BACK = 1;
static const uint8_t ARM_FORWARD = 2;
static const uint8_t ARM_UP = 3;
static const uint8_t ARM_WAVE = 4;
static const uint8_t ARM_POSE_COUNT = 5;
static const uint8_t ARM_POINTS = 4;

static const int8_t ARM_POSE[ARM_POSE_COUNT][ARM_POINTS][2] = {
  {{0, 0}, {1, 1}, {1, 2}, {1, 3}},
  {{0, 0}, {1, 1}, {2, 2}, {2, 3}},
  {{0, 0}, {1, 0}, {2, 0}, {3, 0}},
  {{0, 0}, {1, -1}, {1, -2}, {1, -3}},
  {{0, 0}, {1, -1}, {2, -2}, {3, -3}},
};

static const int8_t WALK_BOB[CREATURE_WALK_FRAMES] = {0, -1, -2, -1, 0, -1, -2, -1};
static const int8_t WALK_LEAN[CREATURE_WALK_FRAMES] = {0, 1, 1, 0, 0, -1, -1, 0};
static const uint8_t WALK_LEFT_LIFT[CREATURE_WALK_FRAMES] = {0, 2, 4, 2, 0, 0, 0, 0};
static const uint8_t WALK_RIGHT_LIFT[CREATURE_WALK_FRAMES] = {0, 0, 0, 0, 0, 2, 4, 2};
static const uint8_t WALK_ARM_RIGHT[CREATURE_WALK_FRAMES] = {
  ARM_DOWN, ARM_BACK, ARM_FORWARD, ARM_BACK, ARM_DOWN, ARM_DOWN, ARM_DOWN, ARM_DOWN};
static const uint8_t WALK_ARM_LEFT[CREATURE_WALK_FRAMES] = {
  ARM_DOWN, ARM_DOWN, ARM_DOWN, ARM_DOWN, ARM_DOWN, ARM_BACK, ARM_FORWARD, ARM_BACK};

static const int8_t CREATURE_GAZE[4] = {0, -1, 0, 1};

static const uint16_t CREATURE_BODY[CREATURE_BODY_ROWS] = {
  0b0001111111111000,
  0b0011111111111100,
  0b0111111111111110,
  0b1111111111111111,
  0b1110011111100111,
  0b1110011111100111,
  0b1111111111111111,
  0b1111111111111111,
  0b1111111111111111,
  0b0111111111111110,
  0b0011111111111100,
};

struct ToneStep {
  uint16_t frequency;
  uint16_t durationMs;
};

static const ToneStep ARRIVAL_CHIME[] = {{1760, 140}, {0, 45}, {1319, 420}};
static const ToneStep EMERGENCY_ALARM[] = {{988, 240}, {659, 240}};
static const uint8_t ARRIVAL_CHIME_STEPS = 3;
static const uint8_t EMERGENCY_ALARM_STEPS = 2;

enum ElevatorState {
  STATE_IDLE,
  STATE_DOOR_OPEN,
  STATE_TRAVELING
};

enum TravelPhase {
  TRAVEL_NONE,
  TRAVEL_AWAIT_DOOR,
  TRAVEL_MOVING,
  TRAVEL_SETTLING,
  TRAVEL_ARRIVAL_PAUSE,
  TRAVEL_ARRIVAL_CHIME
};

enum DoorState {
  DOOR_CLOSED,
  DOOR_OPENING,
  DOOR_OPEN,
  DOOR_CLOSING
};

static void publishStatus();
static void beginDoorMotion(bool opening);
static void beginMoving();
static void requestTrip(uint8_t floor, bool autoReturn);

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
static bool displayReady = false;
static bool displayDirty = true;
static uint8_t arrowFrame = 0;
static uint32_t arrowFrameAt = 0;

static bool creatureVisible = false;
static uint32_t creatureStartedAt = 0;
static uint32_t creatureBlinkAt = 0;
static uint8_t lastDrawnFrame = 0xFF;
static bool lastDrawnBlink = false;
static bool lastDrawnWaving = false;
static int8_t lastDrawnGaze = 0;

static ElevatorState state = STATE_IDLE;
static TravelPhase travelPhase = TRAVEL_NONE;
static DoorState doorState = DOOR_CLOSED;

static uint8_t currentFloor = 0;
static uint8_t selectedFloor = 0;
static uint8_t displayFloor = 0;
static int8_t travelStep = 0;
static bool autoReturnTrip = false;
static bool pendingGrantClear = false;

static uint32_t doorMotionStartedAt = 0;
static uint32_t doorOpenSince = 0;
static uint32_t segmentStartedAt = 0;
static uint32_t settleStartedAt = 0;
static uint32_t arrivalPhaseStartedAt = 0;
static uint32_t arrivalChimeMs = 0;
static uint32_t motorStartedAt = 0;
static uint32_t grantOpenedAt = 0;
static uint32_t lastInputAt = 0;
static bool motorRunning = false;
static bool emergencyActive = false;

static const ToneStep *tonePattern = nullptr;
static uint8_t tonePatternSteps = 0;
static bool tonePatternLoops = false;
static uint8_t toneIndex = 0;
static uint32_t toneStepStartedAt = 0;

static bool floorAuthorized[3] = {false, false, false};
static bool grantActive = false;
static uint8_t boardingFloor = 0;
static char grantToken[65] = "";
static char grantStaff[64] = "";
static char selectedKey[16] = "";
static const char *sessionResult = "none";

static char ackId[24] = "none";
static const char *ackAction = "none";
static bool ackOk = false;
static const char *ackError = "none";

static bool buttonStableHigh[BUTTON_COUNT];
static bool buttonLastReadHigh[BUTTON_COUNT];
static uint32_t buttonChangedAt[BUTTON_COUNT];

static BLECharacteristic *statusChar = nullptr;
static bool clientConnected = false;
static volatile uint8_t bleClientCount = 0;
static volatile bool commandPending = false;
static char commandBuffer[256] = "";

static void ledcConfigure(uint8_t pin, uint32_t frequency, uint8_t bits, uint8_t channel) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcAttach(pin, frequency, bits);
#else
  ledcSetup(channel, frequency, bits);
  ledcAttachPin(pin, channel);
#endif
}

static void ledcApplyDuty(uint8_t pin, uint8_t channel, uint32_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcWrite(pin, duty);
#else
  (void)pin;
  ledcWrite(channel, duty);
#endif
}

static void ledcApplyTone(uint8_t pin, uint8_t channel, uint32_t frequency) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  (void)channel;
  ledcWriteTone(pin, frequency);
#else
  (void)pin;
  ledcWriteTone(channel, (double)frequency);
#endif
}

static void setDoorLed(bool open) {
  digitalWrite(PIN_LED_DOOR, open ? HIGH : LOW);
}

static uint32_t patternDurationMs(const ToneStep *pattern, uint8_t steps) {
  uint32_t total = 0;
  for (uint8_t i = 0; i < steps; i++) {
    total += pattern[i].durationMs;
  }
  return total;
}

static void applyToneStep() {
  if (tonePattern == nullptr) {
    return;
  }
  ledcApplyTone(PIN_BUZZER, BUZZER_PWM_CHANNEL, tonePattern[toneIndex].frequency);
}

static void stopTone() {
  tonePattern = nullptr;
  tonePatternSteps = 0;
  tonePatternLoops = false;
  toneIndex = 0;
  ledcApplyTone(PIN_BUZZER, BUZZER_PWM_CHANNEL, 0);
}

static void startTone(const ToneStep *pattern, uint8_t steps, bool loops) {
  tonePattern = pattern;
  tonePatternSteps = steps;
  tonePatternLoops = loops;
  toneIndex = 0;
  toneStepStartedAt = millis();
  applyToneStep();
}

static void serviceBuzzer() {
  if (tonePattern == nullptr) {
    return;
  }
  uint32_t now = millis();
  if (now - toneStepStartedAt < tonePattern[toneIndex].durationMs) {
    return;
  }
  toneIndex++;
  if (toneIndex >= tonePatternSteps) {
    if (!tonePatternLoops) {
      stopTone();
      return;
    }
    toneIndex = 0;
  }
  toneStepStartedAt = now;
  applyToneStep();
}

static void playArrivalChime() {
  if (emergencyActive) {
    Serial.println("[buzzer] arrival chime suppressed, emergency alarm active");
    return;
  }
  startTone(ARRIVAL_CHIME, ARRIVAL_CHIME_STEPS, false);
}

static void setEmergency(bool active) {
  if (emergencyActive == active) {
    return;
  }
  emergencyActive = active;
  displayDirty = true;
  if (active) {
    startTone(EMERGENCY_ALARM, EMERGENCY_ALARM_STEPS, true);
    Serial.println("[emergency] alarm ON");
  } else {
    stopTone();
    Serial.println("[emergency] alarm cleared");
  }
  publishStatus();
}

static void motorWriteDuty(uint8_t duty) {
  ledcApplyDuty(PIN_MOTOR_ENA, MOTOR_PWM_CHANNEL, duty);
}

static void motorStop() {
  motorWriteDuty(0);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  motorRunning = false;
}

static void motorStart(int8_t direction) {
  digitalWrite(PIN_MOTOR_IN1, direction > 0 ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_IN2, direction > 0 ? LOW : HIGH);
  motorStartedAt = millis();
  motorWriteDuty(MOTOR_KICK_DUTY);
  motorRunning = true;
}

static void serviceMotor() {
  if (!motorRunning) {
    return;
  }
  if (millis() - motorStartedAt >= MOTOR_KICK_MS) {
    motorWriteDuty(MOTOR_CRUISE_DUTY);
  }
}

static void servoWriteMicroseconds(uint8_t pin, uint8_t channel, uint16_t microseconds) {
  uint32_t duty = ((uint32_t)microseconds * 65535UL) / SERVO_PERIOD_US;
  ledcApplyDuty(pin, channel, duty);
}

static uint16_t interpolateUs(uint16_t closedUs, uint16_t openUs, uint16_t permille) {
  int32_t span = (int32_t)openUs - (int32_t)closedUs;
  return (uint16_t)((int32_t)closedUs + (span * (int32_t)permille) / 1000);
}

static uint16_t servoUsForDegrees(uint8_t degrees) {
  uint32_t span = (uint32_t)(SERVO_US_AT_MAX_DEG - SERVO_US_AT_MIN_DEG);
  return (uint16_t)(SERVO_US_AT_MIN_DEG + (span * degrees) / SERVO_MAX_DEG);
}

static void applyDoorPosition(uint16_t permille) {
  uint16_t microseconds = interpolateUs(servoUsForDegrees(DOOR_CLOSED_DEG),
                                        servoUsForDegrees(DOOR_OPEN_DEG), permille);
  servoWriteMicroseconds(PIN_SERVO_LEFT, SERVO_LEFT_CHANNEL, microseconds);
  servoWriteMicroseconds(PIN_SERVO_RIGHT, SERVO_RIGHT_CHANNEL, microseconds);
}

static uint16_t doorPermille() {
  if (doorState == DOOR_OPEN) {
    return 1000;
  }
  if (doorState == DOOR_CLOSED) {
    return 0;
  }
  uint32_t elapsed = millis() - doorMotionStartedAt;
  if (elapsed >= DOOR_TRAVEL_MS) {
    return doorState == DOOR_OPENING ? 1000 : 0;
  }
  uint16_t travelled = (uint16_t)((elapsed * 1000UL) / DOOR_TRAVEL_MS);
  return doorState == DOOR_OPENING ? travelled : (uint16_t)(1000 - travelled);
}

static bool doorOpenAuthorized() {
  if (floorAuthorized[currentFloor]) {
    return true;
  }
  return grantActive && currentFloor == boardingFloor;
}

static bool floorButtonsArmed() {
  if (!grantActive) {
    return true;
  }
  return doorState != DOOR_OPENING;
}

static void beginDoorMotion(bool opening) {
  if (opening && !doorOpenAuthorized()) {
    Serial.print("[door] open refused, no verified authorization for ");
    Serial.println(FLOOR_KEY[currentFloor]);
    return;
  }
  if (opening && doorState == DOOR_OPEN) {
    doorOpenSince = millis();
    return;
  }
  if (opening && doorState == DOOR_OPENING) {
    return;
  }
  if (!opening && (doorState == DOOR_CLOSED || doorState == DOOR_CLOSING)) {
    return;
  }

  uint32_t now = millis();
  uint16_t permille = doorPermille();
  uint32_t travelled = opening ? ((uint32_t)permille * DOOR_TRAVEL_MS) / 1000
                               : ((uint32_t)(1000 - permille) * DOOR_TRAVEL_MS) / 1000;

  doorState = opening ? DOOR_OPENING : DOOR_CLOSING;
  doorMotionStartedAt = now - travelled;
  setDoorLed(true);
  displayDirty = true;
  Serial.println(opening ? "[door] opening" : "[door] closing");
}

static void clearGrant() {
  for (uint8_t i = 0; i < 3; i++) {
    floorAuthorized[i] = false;
  }
  grantActive = false;
  grantToken[0] = '\0';
  grantStaff[0] = '\0';
  pendingGrantClear = false;
}

static void serviceDoor() {
  uint32_t now = millis();

  if (doorState == DOOR_OPENING || doorState == DOOR_CLOSING) {
    bool opening = doorState == DOOR_OPENING;
    uint32_t elapsed = now - doorMotionStartedAt;

    if (elapsed < DOOR_TRAVEL_MS) {
      uint16_t travelled = (uint16_t)((elapsed * 1000UL) / DOOR_TRAVEL_MS);
      applyDoorPosition(opening ? travelled : (uint16_t)(1000 - travelled));
      return;
    }

    applyDoorPosition(opening ? 1000 : 0);
    doorState = opening ? DOOR_OPEN : DOOR_CLOSED;
    doorOpenSince = now;
    setDoorLed(opening);
    displayDirty = true;
    Serial.println(opening ? "[door] fully open" : "[door] fully closed");

    if (!opening) {
      if (pendingGrantClear) {
        clearGrant();
        Serial.println("[grant] authorization consumed, secured state");
      }
      if (travelPhase == TRAVEL_AWAIT_DOOR) {
        beginMoving();
        return;
      }
    }

    publishStatus();
    return;
  }

  if (doorState == DOOR_OPEN && now - doorOpenSince >= DOOR_AUTO_CLOSE_MS) {
    Serial.println("[door] auto close after 10s");
    beginDoorMotion(false);
  }
}

static bool i2cDeviceResponds(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

static void reportI2cBus() {
  uint8_t found = 0;
  Serial.println("[i2c] scanning bus on SDA=21 SCL=22");
  for (uint8_t address = 1; address < 127; address++) {
    if (!i2cDeviceResponds(address)) {
      continue;
    }
    found++;
    Serial.print("[i2c] device at 0x");
    Serial.println(address, HEX);
  }
  if (found == 0) {
    Serial.println("[i2c] no devices found: check VCC, GND, SDA and SCL wiring");
  }
}

static bool startDisplay() {
  const uint8_t candidates[2] = {OLED_ADDRESS_PRIMARY, OLED_ADDRESS_ALTERNATE};
  for (uint8_t i = 0; i < 2; i++) {
    if (!i2cDeviceResponds(candidates[i])) {
      continue;
    }
    if (display.begin(SSD1306_SWITCHCAPVCC, candidates[i], false, false)) {
      Serial.print("[oled] ready at 0x");
      Serial.println(candidates[i], HEX);
      return true;
    }
    Serial.print("[oled] device answered at 0x");
    Serial.print(candidates[i], HEX);
    Serial.println(" but SSD1306 init failed: wrong controller? 1.3\" panels are usually SH1106");
    return false;
  }
  Serial.println("[oled] nothing answered at 0x3C or 0x3D");
  reportI2cBus();
  return false;
}

static void drawCreatureLeg(int16_t originX, uint8_t col, int16_t top, int16_t bottom) {
  const int16_t pixel = CREATURE_PIXEL;
  int16_t x = originX + col * pixel;
  if (bottom > top) {
    display.fillRect(x, top, pixel * 2, bottom - top, SSD1306_WHITE);
  }
  display.fillRect(x - pixel, bottom - pixel, pixel * 4, pixel, SSD1306_WHITE);
}

static void drawCreatureArm(int16_t bodyX, int16_t bodyTop, uint8_t pose, bool mirrored) {
  const int16_t pixel = CREATURE_PIXEL;
  const int16_t anchorX = mirrored ? bodyX : bodyX + (CREATURE_COLS - 1) * pixel;
  const int16_t anchorY = bodyTop + CREATURE_ARM_ROW * pixel;
  const int16_t direction = mirrored ? -1 : 1;

  for (uint8_t i = 0; i + 1 < ARM_POINTS; i++) {
    int16_t x0 = anchorX + ARM_POSE[pose][i][0] * direction * pixel;
    int16_t y0 = anchorY + ARM_POSE[pose][i][1] * pixel;
    int16_t x1 = anchorX + ARM_POSE[pose][i + 1][0] * direction * pixel;
    int16_t y1 = anchorY + ARM_POSE[pose][i + 1][1] * pixel;
    int16_t left = x0 < x1 ? x0 : x1;
    int16_t top = y0 < y1 ? y0 : y1;
    int16_t width = (x0 > x1 ? x0 : x1) - left + pixel;
    int16_t height = (y0 > y1 ? y0 : y1) - top + pixel;
    display.fillRect(left, top, width, height, SSD1306_WHITE);
  }

  int16_t handX = anchorX + ARM_POSE[pose][ARM_POINTS - 1][0] * direction * pixel;
  int16_t handY = anchorY + ARM_POSE[pose][ARM_POINTS - 1][1] * pixel;
  display.fillRect(mirrored ? handX - pixel : handX, handY, pixel * 2, pixel * 2, SSD1306_WHITE);
}

static uint16_t creatureEyeBits(uint16_t bits, bool blinking, int8_t gaze) {
  if (blinking) {
    return bits | CREATURE_EYE_MASK;
  }
  uint16_t sockets = gaze >= 0 ? (uint16_t)(CREATURE_EYE_MASK >> gaze)
                               : (uint16_t)(CREATURE_EYE_MASK << -gaze);
  return (uint16_t)((bits | CREATURE_EYE_MASK) & ~sockets);
}

static void drawCreature(uint8_t frame, bool waving, bool blinking, int8_t gaze) {
  const int16_t pixel = CREATURE_PIXEL;
  const int16_t spriteHeight = (CREATURE_BODY_ROWS + CREATURE_LEG_CELLS) * pixel;
  const int16_t spriteWidth = (CREATURE_COLS + CREATURE_ARM_CELLS * 2) * pixel;
  const int16_t originX = (OLED_WIDTH - spriteWidth) / 2;
  const int16_t originY = (OLED_HEIGHT - spriteHeight) / 2;
  const int16_t baseX = originX + CREATURE_ARM_CELLS * pixel;

  int8_t bob = waving ? (frame % 2 ? -2 : 0) : WALK_BOB[frame];
  int8_t lean = waving ? 0 : WALK_LEAN[frame];
  uint8_t leftLift = waving ? 0 : WALK_LEFT_LIFT[frame];
  uint8_t rightLift = waving ? 0 : WALK_RIGHT_LIFT[frame];
  uint8_t rightArm = waving ? (frame % 2 ? ARM_WAVE : ARM_UP) : WALK_ARM_RIGHT[frame];
  uint8_t leftArm = waving ? ARM_DOWN : WALK_ARM_LEFT[frame];

  const int16_t bodyX = baseX + lean;
  const int16_t bodyTop = originY + bob;
  const int16_t bodyBottom = bodyTop + CREATURE_BODY_ROWS * pixel;
  const int16_t groundY = originY + spriteHeight;

  display.clearDisplay();

  for (uint8_t row = 0; row < CREATURE_BODY_ROWS; row++) {
    uint16_t bits = CREATURE_BODY[row];
    if (row == CREATURE_EYE_ROW || row == CREATURE_EYE_ROW + 1) {
      bits = creatureEyeBits(bits, blinking, gaze);
    }
    for (uint8_t col = 0; col < CREATURE_COLS; col++) {
      if (bits & (0x8000 >> col)) {
        display.fillRect(bodyX + col * pixel, bodyTop + row * pixel, pixel, pixel, SSD1306_WHITE);
      }
    }
  }

  drawCreatureArm(bodyX, bodyTop, leftArm, true);
  drawCreatureArm(bodyX, bodyTop, rightArm, false);
  drawCreatureLeg(baseX, CREATURE_LEG_LEFT_COL, bodyBottom, groundY - leftLift);
  drawCreatureLeg(baseX, CREATURE_LEG_RIGHT_COL, bodyBottom, groundY - rightLift);

  display.display();
}

static void drawChevron(int16_t cx, int16_t top, bool up) {
  const int16_t halfWidth = 14;
  const int16_t depth = 11;
  for (int16_t thickness = 0; thickness < 3; thickness++) {
    int16_t y = top + thickness;
    if (up) {
      display.drawLine(cx - halfWidth, y + depth, cx, y, SSD1306_WHITE);
      display.drawLine(cx, y, cx + halfWidth, y + depth, SSD1306_WHITE);
    } else {
      display.drawLine(cx - halfWidth, y, cx, y + depth, SSD1306_WHITE);
      display.drawLine(cx, y + depth, cx + halfWidth, y, SSD1306_WHITE);
    }
  }
}

static void drawArrow(bool up) {
  const int16_t cx = 96;
  const int16_t slotTop[3] = {6, 22, 38};
  for (uint8_t revealed = 0; revealed <= arrowFrame; revealed++) {
    uint8_t slot = up ? (2 - revealed) : revealed;
    drawChevron(cx, slotTop[slot], up);
  }
}

static const char *captionText() {
  if (emergencyActive) {
    return "EMERGENCY";
  }
  if (doorState == DOOR_OPENING) {
    return "DOOR OPENING";
  }
  if (doorState == DOOR_OPEN) {
    return "DOOR OPEN";
  }
  if (doorState == DOOR_CLOSING) {
    return "DOOR CLOSING";
  }
  if (state == STATE_DOOR_OPEN) {
    return "SELECT FLOOR";
  }
  return FLOOR_LABEL[displayFloor];
}

static void drawScreen() {
  if (!displayReady) {
    return;
  }

  bool showArrow = state == STATE_TRAVELING && travelPhase == TRAVEL_MOVING && travelStep != 0;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(6);
  display.setCursor(showArrow ? 14 : 46, 2);
  display.print(FLOOR_DIGIT[displayFloor]);

  if (showArrow) {
    drawArrow(travelStep > 0);
  }

  const char *caption = captionText();
  display.setTextSize(1);
  display.setCursor((OLED_WIDTH - (int16_t)(strlen(caption) * 6)) / 2, 55);
  display.print(caption);
  display.display();
}

static bool shouldShowCreature() {
  if (state != STATE_IDLE || travelPhase != TRAVEL_NONE) {
    return false;
  }
  if (doorState != DOOR_CLOSED || emergencyActive) {
    return false;
  }
  return millis() - lastInputAt >= IDLE_ANIMATION_MS;
}

static void serviceDisplay() {
  if (!displayReady) {
    return;
  }

  uint32_t now = millis();
  bool wantCreature = shouldShowCreature();

  if (wantCreature != creatureVisible) {
    creatureVisible = wantCreature;
    displayDirty = true;
    lastDrawnFrame = 0xFF;
    if (wantCreature) {
      creatureStartedAt = now;
      creatureBlinkAt = now;
    }
  }

  if (creatureVisible) {
    uint32_t elapsed = now - creatureStartedAt;
    uint32_t cyclePos = elapsed % (CREATURE_WALK_MS + CREATURE_WAVE_MS);
    bool waving = cyclePos >= CREATURE_WALK_MS;
    uint8_t frame = waving
                      ? (uint8_t)(((cyclePos - CREATURE_WALK_MS) / CREATURE_FRAME_MS) % 2)
                      : (uint8_t)((cyclePos / CREATURE_FRAME_MS) % CREATURE_WALK_FRAMES);
    int8_t gaze = CREATURE_GAZE[(elapsed / CREATURE_GAZE_MS) % 4];

    uint32_t sinceBlink = now - creatureBlinkAt;
    if (sinceBlink >= CREATURE_BLINK_INTERVAL_MS) {
      creatureBlinkAt = now;
      sinceBlink = 0;
    }
    bool blinking = sinceBlink < CREATURE_BLINK_MS;

    if (!displayDirty && frame == lastDrawnFrame && waving == lastDrawnWaving &&
        blinking == lastDrawnBlink && gaze == lastDrawnGaze) {
      return;
    }
    displayDirty = false;
    lastDrawnFrame = frame;
    lastDrawnWaving = waving;
    lastDrawnBlink = blinking;
    lastDrawnGaze = gaze;
    drawCreature(frame, waving, blinking, gaze);
    return;
  }

  bool animating = state == STATE_TRAVELING && travelPhase == TRAVEL_MOVING && travelStep != 0;
  if (animating && now - arrowFrameAt >= ARROW_FRAME_MS) {
    arrowFrameAt = now;
    arrowFrame = (arrowFrame + 1) % 3;
    displayDirty = true;
  }

  if (!displayDirty) {
    return;
  }
  displayDirty = false;
  drawScreen();
}

static void enterIdle() {
  state = STATE_IDLE;
  travelPhase = TRAVEL_NONE;
  travelStep = 0;
  autoReturnTrip = false;
  motorStop();
  displayFloor = currentFloor;
  displayDirty = true;
  clearGrant();
  beginDoorMotion(false);
}

static const char *stateName() {
  if (state == STATE_DOOR_OPEN) {
    return "door_open";
  }
  if (state == STATE_TRAVELING) {
    return "traveling";
  }
  return "idle";
}

static uint32_t remainingWindowMs() {
  if (state != STATE_DOOR_OPEN) {
    return 0;
  }
  uint32_t elapsed = millis() - grantOpenedAt;
  return elapsed >= GRANT_WINDOW_MS ? 0 : GRANT_WINDOW_MS - elapsed;
}

static bool grantIncludesFloor(const String &body, const char *key) {
  int floorsAt = body.indexOf("\"floors\"");
  if (floorsAt < 0) {
    return false;
  }
  int open = body.indexOf('[', floorsAt);
  if (open < 0) {
    return false;
  }
  int close = body.indexOf(']', open);
  if (close < 0) {
    return false;
  }
  return body.substring(open, close).indexOf(key) >= 0;
}

static void extractJsonString(const String &body, const char *key, char *out, size_t outSize) {
  out[0] = '\0';
  String needle = String("\"") + key + "\"";
  int keyAt = body.indexOf(needle);
  if (keyAt < 0) {
    return;
  }
  int colon = body.indexOf(':', keyAt + needle.length());
  if (colon < 0) {
    return;
  }
  int start = body.indexOf('"', colon + 1);
  if (start < 0) {
    return;
  }
  int end = body.indexOf('"', start + 1);
  if (end < 0) {
    return;
  }
  String value = body.substring(start + 1, end);
  strncpy(out, value.c_str(), outSize - 1);
  out[outSize - 1] = '\0';
}

static bool commandAuthorized(const String &body) {
  char key[32];
  extractJsonString(body, "key", key, sizeof(key));
  return strcmp(key, DEVICE_KEY) == 0;
}

static String statusJson() {
  String json = "{";
  json += "\"state\":\"";
  json += stateName();
  json += "\",\"door_open\":";
  json += (doorState != DOOR_CLOSED) ? "true" : "false";
  json += ",\"current_floor\":\"";
  json += FLOOR_KEY[currentFloor];
  json += "\",\"selected_floor\":";
  if (selectedKey[0] == '\0') {
    json += "null";
  } else {
    json += "\"";
    json += selectedKey;
    json += "\"";
  }
  json += ",\"session_result\":\"";
  json += sessionResult;
  json += "\",\"remaining_ms\":";
  json += String(remainingWindowMs());
  json += ",\"authorized_floors\":[";
  bool firstFloorKey = true;
  for (uint8_t i = 0; i < 3; i++) {
    if (!floorAuthorized[i]) {
      continue;
    }
    if (!firstFloorKey) {
      json += ",";
    }
    firstFloorKey = false;
    json += "\"";
    json += FLOOR_KEY[i];
    json += "\"";
  }
  json += "],\"buttons_enabled\":";
  json += (state != STATE_TRAVELING && floorButtonsArmed()) ? "true" : "false";
  json += ",\"clients\":";
  json += String((unsigned)bleClientCount);
  json += ",\"emergency\":";
  json += emergencyActive ? "true" : "false";
  json += ",\"ack_id\":\"";
  json += ackId;
  json += "\",\"ack_action\":\"";
  json += ackAction;
  json += "\",\"ack_ok\":";
  json += ackOk ? "true" : "false";
  json += ",\"ack_error\":\"";
  json += ackError;
  json += "\"}";
  return json;
}

static void publishStatus() {
  if (statusChar == nullptr) {
    return;
  }
  String json = statusJson();
  statusChar->setValue((uint8_t *)json.c_str(), json.length());
  if (clientConnected) {
    statusChar->notify();
  }
}

static void processGrant(const String &body) {
  ackAction = "grant";

  if (state != STATE_IDLE) {
    ackOk = false;
    ackError = "busy";
    Serial.println("[grant] rejected: elevator busy");
    return;
  }

  uint8_t authorizedCount = 0;
  for (uint8_t i = 0; i < 3; i++) {
    floorAuthorized[i] = grantIncludesFloor(body, FLOOR_KEY[i]);
    if (floorAuthorized[i]) {
      authorizedCount++;
    }
  }

  if (authorizedCount == 0) {
    clearGrant();
    ackOk = false;
    ackError = "no_authorized_floors";
    Serial.println("[grant] rejected: no authorized floors in payload");
    return;
  }

  extractJsonString(body, "token", grantToken, sizeof(grantToken));
  extractJsonString(body, "staff", grantStaff, sizeof(grantStaff));

  selectedKey[0] = '\0';
  sessionResult = "none";
  selectedFloor = currentFloor;
  displayFloor = currentFloor;
  state = STATE_DOOR_OPEN;
  grantOpenedAt = millis();
  lastInputAt = grantOpenedAt;
  pendingGrantClear = false;
  grantActive = true;
  boardingFloor = currentFloor;
  displayDirty = true;
  beginDoorMotion(true);

  ackOk = true;
  ackError = "none";

  Serial.print("[grant] 2FA complete for ");
  Serial.print(grantStaff[0] == '\0' ? "unnamed staff" : grantStaff);
  Serial.print(" | floors:");
  for (uint8_t i = 0; i < 3; i++) {
    if (floorAuthorized[i]) {
      Serial.print(' ');
      Serial.print(FLOOR_KEY[i]);
    }
  }
  Serial.println();
}

static void processReset() {
  ackAction = "reset";
  selectedKey[0] = '\0';
  sessionResult = "cancelled";
  lastInputAt = millis();
  enterIdle();
  ackOk = true;
  ackError = "none";
  Serial.println("[reset] session cancelled, door closing, motor stopped");
}

static void processCommand(const String &body) {
  char action[16];
  extractJsonString(body, "action", action, sizeof(action));
  extractJsonString(body, "cmd_id", ackId, sizeof(ackId));

  if (!commandAuthorized(body)) {
    ackAction = "denied";
    ackOk = false;
    ackError = "unauthorized";
    Serial.println("[command] rejected: bad device key");
    publishStatus();
    return;
  }

  if (strcmp(action, "grant") == 0) {
    processGrant(body);
  } else if (strcmp(action, "reset") == 0) {
    processReset();
  } else {
    ackAction = "unknown";
    ackOk = false;
    ackError = "unknown_action";
    Serial.print("[command] unknown action: ");
    Serial.println(action);
  }

  publishStatus();
}

static void beginMoving() {
  travelStep = selectedFloor > currentFloor ? 1 : -1;
  displayFloor = currentFloor;
  segmentStartedAt = millis();
  arrowFrame = 0;
  arrowFrameAt = segmentStartedAt;
  travelPhase = TRAVEL_MOVING;
  displayDirty = true;
  motorStart(travelStep);

  Serial.print("[travel] door closed, moving ");
  Serial.print(travelStep > 0 ? "up to " : "down to ");
  Serial.println(FLOOR_KEY[selectedFloor]);
  publishStatus();
}

static void requestTrip(uint8_t floor, bool autoReturn) {
  selectedFloor = floor;
  autoReturnTrip = autoReturn;
  state = STATE_TRAVELING;
  travelPhase = TRAVEL_AWAIT_DOOR;
  displayFloor = currentFloor;
  displayDirty = true;

  if (doorState == DOOR_CLOSED) {
    beginMoving();
    return;
  }

  Serial.println("[travel] request accepted, closing door before moving");
  beginDoorMotion(false);
  publishStatus();
}

static void beginArrivalSequence() {
  motorStop();
  currentFloor = selectedFloor;
  displayFloor = currentFloor;
  travelStep = 0;
  travelPhase = TRAVEL_ARRIVAL_PAUSE;
  arrivalPhaseStartedAt = millis();
  displayDirty = true;

  Serial.print("[arrived] ");
  Serial.print(FLOOR_KEY[currentFloor]);
  Serial.println(", holding 1s before arrival chime");
  publishStatus();
}

static void finishArrival() {
  travelPhase = TRAVEL_NONE;
  state = STATE_IDLE;
  lastInputAt = millis();
  displayDirty = true;

  if (!autoReturnTrip) {
    sessionResult = "arrived";
  }

  if (doorOpenAuthorized()) {
    pendingGrantClear = true;
    beginDoorMotion(true);
  } else {
    Serial.println("[door] staying closed, 2FA not completed for this floor");
    if (autoReturnTrip) {
      clearGrant();
    }
  }

  autoReturnTrip = false;
  publishStatus();
}

static void onFloorButton(uint8_t index) {
  if (state == STATE_TRAVELING) {
    Serial.print("[button] ignored, trip in progress: ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }
  if (grantActive && !floorAuthorized[index]) {
    Serial.print("[button] ignored, floor not assigned to ");
    Serial.print(grantStaff[0] == '\0' ? "this badge" : grantStaff);
    Serial.print(": ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }
  if (!floorButtonsArmed()) {
    Serial.print("[button] held, door still opening: ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }
  if (index == currentFloor) {
    Serial.print("[button] rejected, already at ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }

  strncpy(selectedKey, FLOOR_KEY[index], sizeof(selectedKey) - 1);
  selectedKey[sizeof(selectedKey) - 1] = '\0';
  Serial.print("[button] accepted: ");
  Serial.println(FLOOR_KEY[index]);
  requestTrip(index, false);
}

static void onDoorButton() {
  if (state == STATE_TRAVELING) {
    Serial.println("[door] button ignored, trip in progress");
    return;
  }
  beginDoorMotion(doorState == DOOR_CLOSED || doorState == DOOR_CLOSING);
}

static void onEmergencyButton() {
  setEmergency(!emergencyActive);
}

static void onButtonPressed(uint8_t index) {
  lastInputAt = millis();

  if (index < 3) {
    onFloorButton(index);
    return;
  }
  if (index == BUTTON_DOOR_INDEX) {
    onDoorButton();
    return;
  }
  if (index == BUTTON_EMERGENCY_INDEX) {
    onEmergencyButton();
  }
}

static void pollButtons() {
  uint32_t now = millis();
  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    bool levelHigh = digitalRead(PIN_BUTTON[i]) == HIGH;
    if (levelHigh != buttonLastReadHigh[i]) {
      buttonLastReadHigh[i] = levelHigh;
      buttonChangedAt[i] = now;
      continue;
    }
    if (now - buttonChangedAt[i] < DEBOUNCE_MS) {
      continue;
    }
    if (levelHigh == buttonStableHigh[i]) {
      continue;
    }
    buttonStableHigh[i] = levelHigh;
    if (!levelHigh) {
      onButtonPressed(i);
    }
  }
}

static void serviceTravel(uint32_t now) {
  if (travelPhase == TRAVEL_SETTLING) {
    if (now - settleStartedAt >= MOTOR_STOP_DELAY_MS) {
      beginArrivalSequence();
    }
    return;
  }

  if (travelPhase == TRAVEL_ARRIVAL_PAUSE) {
    if (now - arrivalPhaseStartedAt >= ARRIVAL_CHIME_DELAY_MS) {
      playArrivalChime();
      travelPhase = TRAVEL_ARRIVAL_CHIME;
      arrivalPhaseStartedAt = now;
    }
    return;
  }

  if (travelPhase == TRAVEL_ARRIVAL_CHIME) {
    if (now - arrivalPhaseStartedAt >= arrivalChimeMs) {
      finishArrival();
    }
    return;
  }

  if (travelPhase != TRAVEL_MOVING) {
    return;
  }

  if (now - segmentStartedAt < FLOOR_TRAVEL_MS) {
    return;
  }

  displayFloor = (uint8_t)((int8_t)displayFloor + travelStep);
  currentFloor = displayFloor;
  segmentStartedAt = now;
  arrowFrame = 0;
  arrowFrameAt = now;
  displayDirty = true;

  if (displayFloor == selectedFloor) {
    travelPhase = TRAVEL_SETTLING;  
    settleStartedAt = now;
    Serial.print("[travel] reached ");
    Serial.print(FLOOR_KEY[displayFloor]);
    Serial.println(", leveling before motor stop");
  } else {
    Serial.print("[travel] passing ");
    Serial.println(FLOOR_KEY[displayFloor]);
  }

  publishStatus();
}

static void serviceInactivity(uint32_t now) {
  if (state != STATE_IDLE || doorState != DOOR_CLOSED) {
    return;
  }
  if (currentFloor == LOBBY_FLOOR) {
    return;
  }
  if (now - lastInputAt < INACTIVITY_RETURN_MS) {
    return;
  }

  lastInputAt = now;
  Serial.println("[inactivity] 20s without input, returning to FirstFloor");
  requestTrip(LOBBY_FLOOR, true);
}

static void serviceStateMachine() {
  uint32_t now = millis();

  if (state == STATE_DOOR_OPEN && now - grantOpenedAt >= GRANT_WINDOW_MS) {
    sessionResult = "timeout";
    enterIdle();
    Serial.println("[timeout] no floor selected in 30s, authorization cleared");
    publishStatus();
    return;
  }

  if (state == STATE_TRAVELING) {
    serviceTravel(now);
    return;
  }

  serviceInactivity(now);
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    if (bleClientCount < 0xFF) {
      bleClientCount++;
    }
    clientConnected = true;
    Serial.print("[ble] scanner connected, clients now ");
    Serial.println((unsigned)bleClientCount);
    // Keep advertising after the first client so further scanners (and the
    // admin app) can join instead of being locked out by a single link.
    BLEDevice::startAdvertising();
  }

  void onDisconnect(BLEServer *server) override {
    if (bleClientCount > 0) {
      bleClientCount--;
    }
    clientConnected = bleClientCount > 0;
    Serial.print("[ble] scanner disconnected, clients now ");
    Serial.println((unsigned)bleClientCount);
    BLEDevice::startAdvertising();
  }
};

class StatusCallbacks : public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic *characteristic) override {
    String json = statusJson();
    characteristic->setValue((uint8_t *)json.c_str(), json.length());
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue().c_str();
    if (value.length() == 0 || value.length() >= sizeof(commandBuffer)) {
      return;
    }
    strncpy(commandBuffer, value.c_str(), sizeof(commandBuffer) - 1);
    commandBuffer[sizeof(commandBuffer) - 1] = '\0';
    commandPending = true;
  }
};

void setup() {
  Serial.begin(115200);
  delay(200);

  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    pinMode(PIN_BUTTON[i], INPUT_PULLUP);
    buttonStableHigh[i] = digitalRead(PIN_BUTTON[i]) == HIGH;
    buttonLastReadHigh[i] = buttonStableHigh[i];
    buttonChangedAt[i] = millis();
  }

  pinMode(PIN_LED_DOOR, OUTPUT);
  setDoorLed(false);

  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);

  ledcConfigure(PIN_MOTOR_ENA, MOTOR_PWM_FREQ, MOTOR_PWM_BITS, MOTOR_PWM_CHANNEL);
  motorStop();

  ledcConfigure(PIN_BUZZER, BUZZER_PWM_FREQ, BUZZER_PWM_BITS, BUZZER_PWM_CHANNEL);
  stopTone();
  arrivalChimeMs = patternDurationMs(ARRIVAL_CHIME, ARRIVAL_CHIME_STEPS);

  ledcConfigure(PIN_SERVO_LEFT, SERVO_PWM_FREQ, SERVO_PWM_BITS, SERVO_LEFT_CHANNEL);
  ledcConfigure(PIN_SERVO_RIGHT, SERVO_PWM_FREQ, SERVO_PWM_BITS, SERVO_RIGHT_CHANNEL);
  doorState = DOOR_CLOSED;
  applyDoorPosition(0);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_I2C_HZ);
  displayReady = startDisplay();
  if (!displayReady) {
    Serial.println("[oled] continuing without display");
  }

  currentFloor = LOBBY_FLOOR;
  enterIdle();

  lastInputAt = millis() - IDLE_ANIMATION_MS;
  Serial.println("[boot] idle at FirstFloor, door closed, idle animation showing");

  BLEDevice::init(BLE_NAME);
  BLEDevice::setMTU(247);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  statusChar = service->createCharacteristic(
    STATUS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());
  statusChar->setCallbacks(new StatusCallbacks());

  BLECharacteristic *commandChar = service->createCharacteristic(
    COMMAND_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE);
  commandChar->setCallbacks(new CommandCallbacks());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  publishStatus();
  Serial.print("[ble] advertising as \"");
  Serial.print(BLE_NAME);
  Serial.println("\", terminal can now pair");
}

void loop() {
  if (commandPending) {
    commandPending = false;
    processCommand(String(commandBuffer));
  }
  pollButtons();
  serviceDoor();
  serviceStateMachine();
  serviceMotor();
  serviceBuzzer();
  serviceDisplay();
  delay(5);
}
