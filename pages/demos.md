# Demos

- [Demos](#demos)
  - [device-settings.html](#device-settingshtml)
    - [Features](#features)
  - [dfu.html](#dfuhtml)
    - [Features](#features-1)
    - [Related links](#related-links)
  - [mfkey32.html](#mfkey32html)
    - [Features](#features-2)
    - [Related links](#related-links-1)
  - [mifare1k.html](#mifare1khtml)
    - [Features](#features-3)
  - [hf14a-scanner.html](#hf14a-scannerhtml)
    - [Features](#features-4)
  - [mifare-xiaomi.html](#mifare-xiaomihtml)
    - [Features](#features-5)
  - [mifare-value.html](#mifare-valuehtml)
    - [Features](#features-6)

## [device-settings.html](https://taichunmin.idv.tw/chameleon-ultra.js/device-settings.html)

A ChameleonUltra tool to management the device info and settings.

![](https://i.imgur.com/TgVdsVo.png)

### Features

- Show device info
- Load/Save device settings
- Modify Button Action
- Change BLE pairing key
- Reset to default settings
- Delete all BLE bonds
- Factory reset

- - -

## [dfu.html](https://taichunmin.idv.tw/chameleon-ultra.js/dfu.html)

A tool to upload firmware to ChameleonUltra.

### Features

- Select tag to upload firmware

### Related links

- [Uploading the code in DFU mode](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/development.md#uploading-the-code-in-dfu-mode)
- [nRF5 SDK: DFU protocol](https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html)
- [GitHub: GameTec-live/ChameleonUltraGUI](https://github.com/GameTec-live/ChameleonUltraGUI/blob/main/chameleonultragui/lib/bridge/dfu.dart)
- [GitHub: thegecko/web-bluetooth-dfu](https://github.com/thegecko/web-bluetooth-dfu)

- - -

## [mfkey32.html](https://taichunmin.idv.tw/chameleon-ultra.js/mfkey32.html)

A ChameleonUltra tool to detect the mifare key that reader is authenticating (a.k.a. MFKey32).

![](https://i.imgur.com/OyZ4E3Z.png)

### Features

- Emulate a mifare card and enable detect mode
- Recover the mifare key that reader is authenticating
- Check the mifare key is correct or not

### Related links

- [Recovering keys with MFKey32 | Flipper Zero](https://docs.flipper.net/nfc/mfkey32)
- [How to use MFKEY32 | ChameleonUltraGUI](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/chameleonultragui.md#how-to-use-mfkey32)
- [MFKey32 example trace | proxmark3](https://github.com/RfidResearchGroup/proxmark3/blob/master/tools/mfkey/example_trace.txt)

- - -

## [mifare1k.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare1k.html)

A ChameleonUltra tool for mifare class 1k.

![](https://i.imgur.com/zJ1qIdj.png)

### Features

- Load/Emulate for slot of ChameleonUltra.
- Read/Write for Mifare Gen1a Tag (UID).
- Read/Write for Mifare Classic 1k, Gen2 Tag (CUID, FUID, UFUID).
- Import/Export dump for `.json`, `.bin`, `.eml`, `.mct` files.

- - -

## [hf14a-scanner.html](https://taichunmin.idv.tw/chameleon-ultra.js/hf14a-scanner.html)

A tool to scan uid of ISO/IEC 14443-A tags.

![](https://i.imgur.com/8QfzaaZ.png)

### Features

- Continuous scan `UID`, `ATQA`, `SAK` for ISO/IEC 14443-A tags.

- - -

## [mifare-xiaomi.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-xiaomi.html)

A tool for Xiaomi Watch to clone encrypted Mifare Classic tag.

![](https://i.imgur.com/M39Y0Be.png)

### Features

- Import/Export dump for `.json`, `.bin`, `.eml`, `.mct` files.
- Emulate ChameleonUltra as non-encrypted Mifare Classic tag.
- Write/Verify/Read for Xiaomi Watch.

- - -

## [mifare-value.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-value.html)

在台灣有些 MIFARE Classic 卡片使用 value block 來儲存卡片的餘額，但是有些中國魔術卡不支援 value block 指令，所以無法使用這些魔術卡來複製 MIFARE Classic 卡片。這個工具可以讓你測試卡片是否支援 value block 指令。

A ChameleonUltra tool for MIFARE Classic value block commands. Some MIFARE Classic cards in Taiwan are using value block to store the balance of the card. But some chinese magic cards didn't support value block commands. So you can't use these magic cards to clone original MIFARE Classic cards. This tool can help you to test whether the card support value block commands or not.

![](https://i.imgur.com/jJ3pNvn.png)

### Features

- Get/Set for mifare value block
- Increase/Decrease/Restore for mifare value block
