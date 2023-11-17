# Demos

- [Demos](#demos)
  - [device-settings.html](#device-settingshtml)
    - [Features](#features)
  - [mfkey32.html](#mfkey32html)
    - [Features](#features-1)
    - [Related links](#related-links)
  - [mifare1k.html](#mifare1khtml)
    - [Features](#features-2)
  - [mifare-value.html](#mifare-valuehtml)
    - [Features](#features-3)

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

- Load/Emulate from slot of ChameleonUltra.
- Read/Write from Mifare Gen1a Tag (UID).
- Read/Write from Mifare Classic 1k, Gen2 Tag (CUID, FUID, UFUID).
- Import/Export from `.json`, `.bin`, `.eml`, `.mct` files.

- - -

## [mifare-value.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-value.html)

![](https://i.imgur.com/jJ3pNvn.png)

在台灣有些 MIFARE Classic 卡片使用 value block 來儲存卡片的餘額，但是有些中國魔術卡不支援 value block 指令，所以無法使用這些魔術卡來複製 MIFARE Classic 卡片。這個工具可以讓你測試卡片是否支援 value block 指令。

A ChameleonUltra tool for MIFARE Classic value block commands. Some MIFARE Classic cards in Taiwan are using value block to store the balance of the card. But some chinese magic cards didn't support value block commands. So you can't use these magic cards to clone original MIFARE Classic cards. This tool can help you to test whether the card support value block commands or not.

### Features

- Get/Set mifare value block
- Increase/Decrease/Restore mifare value block
