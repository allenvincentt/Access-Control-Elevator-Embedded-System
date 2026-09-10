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
static const uint8_t PIN_LED_FLOOR[3] = {26, 27, 14};
static const uint8_t PIN_LED_DOOR = 13;

static const char *FLOOR_KEY[3] = {"MainLobby", "SecondFloor", "ThirdFloor"};

static const uint32_t DOOR_OPEN_WINDOW_MS = 30000;
static const uint32_t TRAVEL_MS = 1000;
static const uint32_t DEBOUNCE_MS = 30;

enum ElevatorState {
  STATE_IDLE,
  STATE_DOOR_OPEN,
  STATE_TRAVELING
};

static ElevatorState state = STATE_IDLE;
static uint8_t currentFloor = 0;
static uint8_t selectedFloor = 0;
static bool floorAuthorized[3] = {false, false, false};
static char grantToken[65] = "";
static char grantStaff[64] = "";
static char selectedKey[16] = "";
static const char *sessionResult = "none";
static uint32_t doorOpenedAt = 0;
static uint32_t travelStartedAt = 0;

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

static void applyFloorLeds() {
  for (uint8_t i = 0; i < 3; i++) {
    digitalWrite(PIN_LED_FLOOR[i], i == currentFloor ? HIGH : LOW);
  }
}

static void setDoorLed(bool open) {
  digitalWrite(PIN_LED_DOOR, open ? HIGH : LOW);
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
  setDoorLed(false);
  applyFloorLeds();
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
  state = STATE_DOOR_OPEN;
  doorOpenedAt = millis();
  setDoorLed(true);
  applyFloorLeds();

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
  Serial.println("[reset] session cancelled, door closed");
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
  travelStartedAt = millis();

  Serial.print("[button] accepted, traveling to ");
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

static void serviceStateMachine() {
  uint32_t now = millis();

  if (state == STATE_DOOR_OPEN && now - doorOpenedAt >= DOOR_OPEN_WINDOW_MS) {
    sessionResult = "timeout";
    enterIdle();
    Serial.println("[timeout] no authorized selection in 30s, door closed");
    publishStatus();
    return;
  }

  if (state == STATE_TRAVELING && now - travelStartedAt >= TRAVEL_MS) {
    currentFloor = selectedFloor;
    setDoorLed(false);
    applyFloorLeds();
    sessionResult = "arrived";
    state = STATE_IDLE;
    clearGrant();
    Serial.print("[arrived] ");
    Serial.println(FLOOR_KEY[currentFloor]);
    publishStatus();
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
    pinMode(PIN_LED_FLOOR[i], OUTPUT);
    digitalWrite(PIN_LED_FLOOR[i], LOW);
    buttonStableHigh[i] = digitalRead(PIN_BUTTON_FLOOR[i]) == HIGH;
    buttonLastReadHigh[i] = buttonStableHigh[i];
    buttonChangedAt[i] = millis();
  }

  pinMode(PIN_LED_DOOR, OUTPUT);

  currentFloor = 0;
  enterIdle();
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
  delay(5);
}
