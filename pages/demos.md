# Demos

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
