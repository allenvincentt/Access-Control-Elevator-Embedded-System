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

static const uint8_t PIN_BUTTON_FLOOR[3] = {32, 33, 25};
static const uint8_t PIN_LED_DOOR = 13;
static const uint8_t PIN_MOTOR_IN1 = 26;
static const uint8_t PIN_MOTOR_IN2 = 27;
static const uint8_t PIN_MOTOR_ENA = 14;
static const uint8_t PIN_OLED_SDA = 21;
static const uint8_t PIN_OLED_SCL = 22;

static const uint8_t OLED_WIDTH = 128;
static const uint8_t OLED_HEIGHT = 64;
static const uint8_t OLED_ADDRESS_PRIMARY = 0x3C;
static const uint8_t OLED_ADDRESS_ALTERNATE = 0x3D;
static const uint32_t OLED_I2C_HZ = 100000;

static const char *FLOOR_KEY[3] = {"MainLobby", "SecondFloor", "ThirdFloor"};
static const char FLOOR_DIGIT[3] = {'1', '2', '3'};
static const char *FLOOR_LABEL[3] = {"MAIN LOBBY", "SECOND FLOOR", "THIRD FLOOR"};

static const uint32_t DOOR_OPEN_WINDOW_MS = 30000;
static const uint32_t FLOOR_TRAVEL_MS = 1400;
static const uint32_t MOTOR_STOP_DELAY_MS = 700;
static const uint32_t MOTOR_KICK_MS = 150;
static const uint32_t ARROW_FRAME_MS = 220;
static const uint32_t DEBOUNCE_MS = 30;

static const uint32_t MOTOR_PWM_FREQ = 20000;
static const uint8_t MOTOR_PWM_BITS = 8;
static const uint8_t MOTOR_PWM_CHANNEL = 0;
static const uint8_t MOTOR_KICK_DUTY = 255;
static const uint8_t MOTOR_CRUISE_DUTY = 190;

enum ElevatorState {
  STATE_IDLE,
  STATE_DOOR_OPEN,
  STATE_TRAVELING
};

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
static bool displayReady = false;
static bool displayDirty = true;
static uint8_t arrowFrame = 0;
static uint32_t arrowFrameAt = 0;

static ElevatorState state = STATE_IDLE;
static uint8_t currentFloor = 0;
static uint8_t selectedFloor = 0;
static uint8_t displayFloor = 0;
static int8_t travelStep = 0;
static bool motorSettling = false;
static uint32_t segmentStartedAt = 0;
static uint32_t settleStartedAt = 0;
static uint32_t motorStartedAt = 0;
static bool motorRunning = false;

static bool floorAuthorized[3] = {false, false, false};
static char grantToken[65] = "";
static char grantStaff[64] = "";
static char selectedKey[16] = "";
static const char *sessionResult = "none";
static uint32_t doorOpenedAt = 0;

static char ackId[24] = "none";
static const char *ackAction = "none";
static bool ackOk = false;
static const char *ackError = "none";

static bool buttonStableHigh[3] = {true, true, true};
static bool buttonLastReadHigh[3] = {true, true, true};
static uint32_t buttonChangedAt[3] = {0, 0, 0};

static BLECharacteristic *statusChar = nullptr;
static bool clientConnected = false;
static volatile bool commandPending = false;
static char commandBuffer[256] = "";

static void setDoorLed(bool open) {
  digitalWrite(PIN_LED_DOOR, open ? HIGH : LOW);
}

static void motorWriteDuty(uint8_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_MOTOR_ENA, duty);
#else
  ledcWrite(MOTOR_PWM_CHANNEL, duty);
#endif
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

static void drawScreen() {
  if (!displayReady) {
    return;
  }

  bool showArrow = state == STATE_TRAVELING && !motorSettling && travelStep != 0;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(6);
  display.setCursor(showArrow ? 14 : 46, 2);
  display.print(FLOOR_DIGIT[displayFloor]);

  if (showArrow) {
    drawArrow(travelStep > 0);
  }

  const char *caption = state == STATE_DOOR_OPEN ? "DOOR OPEN" : FLOOR_LABEL[displayFloor];
  display.setTextSize(1);
  display.setCursor((OLED_WIDTH - (int16_t)(strlen(caption) * 6)) / 2, 55);
  display.print(caption);
  display.display();
}

static void serviceDisplay() {
  bool animating = state == STATE_TRAVELING && !motorSettling && travelStep != 0;
  uint32_t now = millis();

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

static void clearGrant() {
  for (uint8_t i = 0; i < 3; i++) {
    floorAuthorized[i] = false;
  }
  grantToken[0] = '\0';
  grantStaff[0] = '\0';
}

static void enterIdle() {
  state = STATE_IDLE;
  travelStep = 0;
  motorSettling = false;
  motorStop();
  setDoorLed(false);
  displayFloor = currentFloor;
  displayDirty = true;
  clearGrant();
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
  uint32_t elapsed = millis() - doorOpenedAt;
  return elapsed >= DOOR_OPEN_WINDOW_MS ? 0 : DOOR_OPEN_WINDOW_MS - elapsed;
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
  json += (state == STATE_DOOR_OPEN) ? "true" : "false";
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
  doorOpenedAt = millis();
  setDoorLed(true);
  displayDirty = true;

  ackOk = true;
  ackError = "none";

  Serial.print("[grant] door open for ");
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
  enterIdle();
  ackOk = true;
  ackError = "none";
  Serial.println("[reset] session cancelled, door closed, motor stopped");
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

static void arriveAtDestination() {
  motorStop();
  currentFloor = selectedFloor;
  displayFloor = currentFloor;
  travelStep = 0;
  motorSettling = false;
  sessionResult = "arrived";
  state = STATE_IDLE;
  setDoorLed(false);
  displayDirty = true;
  clearGrant();
  Serial.print("[arrived] ");
  Serial.println(FLOOR_KEY[currentFloor]);
  publishStatus();
}

static void onButtonPressed(uint8_t index) {
  if (state != STATE_DOOR_OPEN) {
    Serial.print("[button] ignored (");
    Serial.print(stateName());
    Serial.print("): ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }
  if (!floorAuthorized[index]) {
    Serial.print("[button] denied, floor not authorized: ");
    Serial.println(FLOOR_KEY[index]);
    return;
  }

  selectedFloor = index;
  strncpy(selectedKey, FLOOR_KEY[index], sizeof(selectedKey) - 1);
  selectedKey[sizeof(selectedKey) - 1] = '\0';
  state = STATE_TRAVELING;
  setDoorLed(false);
  displayFloor = currentFloor;
  displayDirty = true;

  if (selectedFloor == currentFloor) {
    Serial.print("[button] already at ");
    Serial.println(FLOOR_KEY[index]);
    arriveAtDestination();
    return;
  }

  travelStep = selectedFloor > currentFloor ? 1 : -1;
  motorSettling = false;
  segmentStartedAt = millis();
  arrowFrame = 0;
  arrowFrameAt = segmentStartedAt;
  motorStart(travelStep);

  Serial.print("[button] accepted, traveling ");
  Serial.print(travelStep > 0 ? "up to " : "down to ");
  Serial.println(FLOOR_KEY[index]);
  publishStatus();
}

static void pollButtons() {
  uint32_t now = millis();
  for (uint8_t i = 0; i < 3; i++) {
    bool levelHigh = digitalRead(PIN_BUTTON_FLOOR[i]) == HIGH;
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
  if (motorSettling) {
    if (now - settleStartedAt >= MOTOR_STOP_DELAY_MS) {
      arriveAtDestination();
    }
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
    motorSettling = true;
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

static void serviceStateMachine() {
  uint32_t now = millis();

  if (state == STATE_DOOR_OPEN && now - doorOpenedAt >= DOOR_OPEN_WINDOW_MS) {
    sessionResult = "timeout";
    enterIdle();
    Serial.println("[timeout] no authorized selection in 30s, door closed");
    publishStatus();
    return;
  }

  if (state == STATE_TRAVELING) {
    serviceTravel(now);
  }
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    clientConnected = true;
    Serial.println("[ble] terminal connected");
  }

  void onDisconnect(BLEServer *server) override {
    clientConnected = false;
    Serial.println("[ble] terminal disconnected, advertising again");
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

  for (uint8_t i = 0; i < 3; i++) {
    pinMode(PIN_BUTTON_FLOOR[i], INPUT_PULLUP);
    buttonStableHigh[i] = digitalRead(PIN_BUTTON_FLOOR[i]) == HIGH;
    buttonLastReadHigh[i] = buttonStableHigh[i];
    buttonChangedAt[i] = millis();
  }

  pinMode(PIN_LED_DOOR, OUTPUT);
  digitalWrite(PIN_LED_DOOR, LOW);

  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_MOTOR_ENA, MOTOR_PWM_FREQ, MOTOR_PWM_BITS);
#else
  ledcSetup(MOTOR_PWM_CHANNEL, MOTOR_PWM_FREQ, MOTOR_PWM_BITS);
  ledcAttachPin(PIN_MOTOR_ENA, MOTOR_PWM_CHANNEL);
#endif
  motorStop();

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_I2C_HZ);
  displayReady = startDisplay();
  if (!displayReady) {
    Serial.println("[oled] continuing without display");
  }

  currentFloor = 0;
  enterIdle();
  drawScreen();
  Serial.println("[boot] idle at MainLobby, door closed, buttons disarmed");

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
  serviceStateMachine();
  serviceMotor();
  serviceDisplay();
  delay(5);
}
