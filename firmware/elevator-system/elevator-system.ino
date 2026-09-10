#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

static const char *WIFI_SSID = "InfinixAllen";
static const char *WIFI_PASSWORD = "123@infi";
static const char *MDNS_HOSTNAME = "elevator";
static const char *DEVICE_KEY = "Elevator123";

static const uint8_t PIN_BUTTON_FLOOR[3] = {32, 33, 25};
static const uint8_t PIN_LED_FLOOR[3] = {26, 27, 14};
static const uint8_t PIN_LED_DOOR = 13;

static const char *FLOOR_KEY[3] = {"MainLobby", "SecondFloor", "ThirdFloor"};

static const uint32_t DOOR_OPEN_WINDOW_MS = 30000;
static const uint32_t TRAVEL_MS = 1000;
static const uint32_t DEBOUNCE_MS = 30;
static const uint32_t WIFI_RETRY_MS = 5000;

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
static uint32_t wifiRetryAt = 0;

static bool buttonStableHigh[3] = {true, true, true};
static bool buttonLastReadHigh[3] = {true, true, true};
static uint32_t buttonChangedAt[3] = {0, 0, 0};

static WebServer server(80);

static const char *COLLECTED_HEADERS[] = {"X-Elevator-Key"};

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

static bool requestAuthorized() {
  if (!server.hasHeader("X-Elevator-Key")) {
    return false;
  }
  return server.header("X-Elevator-Key").equals(DEVICE_KEY);
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
  json += ",\"token\":";
  if (grantToken[0] == '\0') {
    json += "null";
  } else {
    json += "\"";
    json += grantToken;
    json += "\"";
  }
  json += "}";
  return json;
}

static void sendJson(int code, const String &json) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json", json);
}

static void sendError(int code, const char *reason) {
  String json = "{\"ok\":false,\"error\":\"";
  json += reason;
  json += "\"}";
  sendJson(code, json);
}

static void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Elevator-Key");
  server.send(204);
}

static void handleStatus() {
  sendJson(200, statusJson());
}

static void handleGrant() {
  if (!requestAuthorized()) {
    Serial.println("[grant] rejected: bad device key");
    sendError(401, "unauthorized");
    return;
  }
  if (state != STATE_IDLE) {
    Serial.println("[grant] rejected: elevator busy");
    sendError(409, "busy");
    return;
  }

  String body = server.arg("plain");
  uint8_t authorizedCount = 0;
  for (uint8_t i = 0; i < 3; i++) {
    floorAuthorized[i] = grantIncludesFloor(body, FLOOR_KEY[i]);
    if (floorAuthorized[i]) {
      authorizedCount++;
    }
  }

  if (authorizedCount == 0) {
    clearGrant();
    Serial.println("[grant] rejected: no authorized floors in payload");
    sendError(400, "no_authorized_floors");
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

  sendJson(200, statusJson());
}

static void handleReset() {
  if (!requestAuthorized()) {
    sendError(401, "unauthorized");
    return;
  }
  selectedKey[0] = '\0';
  sessionResult = "cancelled";
  enterIdle();
  Serial.println("[reset] session cancelled, door closed");
  sendJson(200, statusJson());
}

static void handleNotFound() {
  sendError(404, "not_found");
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
  }
}

static void serviceWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  uint32_t now = millis();
  if (now - wifiRetryAt < WIFI_RETRY_MS) {
    return;
  }
  wifiRetryAt = now;
  Serial.println("[wifi] reconnecting to hotspot");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[wifi] joining ");
  Serial.println(WIFI_SSID);

  uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 20000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] not connected yet, will keep retrying in loop");
    return;
  }

  Serial.print("[wifi] connected, terminal URL: http://");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(MDNS_HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.print("[mdns] also reachable at http://");
    Serial.print(MDNS_HOSTNAME);
    Serial.println(".local");
  }
}

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

  connectWifi();

  server.collectHeaders(COLLECTED_HEADERS, 1);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/grant", HTTP_POST, handleGrant);
  server.on("/grant", HTTP_OPTIONS, handleOptions);
  server.on("/reset", HTTP_POST, handleReset);
  server.on("/reset", HTTP_OPTIONS, handleOptions);
  server.on("/", HTTP_GET, handleStatus);
  server.onNotFound(handleNotFound);
  server.begin();

  Serial.println("[http] listening on port 80");
}

void loop() {
  serviceWifi();
  server.handleClient();
  pollButtons();
  serviceStateMachine();
}
