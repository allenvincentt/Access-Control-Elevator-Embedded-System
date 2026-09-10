#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

static const uint8_t PIN_OLED_SDA = 21;
static const uint8_t PIN_OLED_SCL = 22;
static const uint32_t OLED_I2C_HZ = 100000;

static Adafruit_SSD1306 display(128, 64, &Wire, -1);
static bool displayReady = false;
static uint8_t displayAddress = 0;

static bool i2cDeviceResponds(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

static uint8_t scanBus() {
  uint8_t first = 0;
  uint8_t found = 0;
  Serial.print("[i2c] scanning SDA=");
  Serial.print(PIN_OLED_SDA);
  Serial.print(" SCL=");
  Serial.println(PIN_OLED_SCL);

  for (uint8_t address = 1; address < 127; address++) {
    if (!i2cDeviceResponds(address)) {
      continue;
    }
    found++;
    if (first == 0) {
      first = address;
    }
    Serial.print("[i2c] device at 0x");
    Serial.println(address, HEX);
  }

  if (found == 0) {
    Serial.println("[i2c] nothing on the bus");
    Serial.println("[i2c] check: VCC to 3V3, GND to GND, SDA to GPIO21, SCL to GPIO22");
  } else {
    Serial.print("[i2c] ");
    Serial.print(found);
    Serial.println(" device(s) total");
  }
  return first;
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println("[boot] OLED bring-up check");

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_I2C_HZ);

  displayAddress = scanBus();
  if (displayAddress == 0) {
    return;
  }

  displayReady = display.begin(SSD1306_SWITCHCAPVCC, displayAddress, false, false);
  if (!displayReady) {
    Serial.print("[oled] SSD1306 init failed at 0x");
    Serial.println(displayAddress, HEX);
    Serial.println("[oled] the panel answered, so wiring is fine; the controller is probably SH1106");
    Serial.println("[oled] 1.3 inch modules need Adafruit_SH110X or U8g2 instead");
    return;
  }

  Serial.print("[oled] SSD1306 running at 0x");
  Serial.println(displayAddress, HEX);

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(6);
  display.setCursor(14, 2);
  display.print('1');
  for (uint8_t slot = 0; slot < 3; slot++) {
    int16_t top = 6 + slot * 16;
    for (int16_t thickness = 0; thickness < 3; thickness++) {
      int16_t y = top + thickness;
      display.drawLine(82, y + 11, 96, y, SSD1306_WHITE);
      display.drawLine(96, y, 110, y + 11, SSD1306_WHITE);
    }
  }
  display.setTextSize(1);
  display.setCursor(31, 55);
  display.print("OLED TEST OK");
  display.display();
}

void loop() {
  if (!displayReady) {
    delay(2000);
    Serial.println("[oled] no display, nothing to animate");
    return;
  }
  display.invertDisplay(true);
  delay(500);
  display.invertDisplay(false);
  delay(500);
}
