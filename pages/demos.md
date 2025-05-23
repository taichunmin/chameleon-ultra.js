---
title: Demos
group: Documents
category: Guides
---

# Demos

## [device-settings.html](https://taichunmin.idv.tw/chameleon-ultra.js/device-settings.html)

A ChameleonUltra tool to management the device info and settings.

![](https://i.imgur.com/TgVdsVo.png)

<h3>Features</h3>

- Show device info
- Load/Save device settings
- Modify Button Action
- Change BLE pairing key
- Reset to default settings
- Delete all BLE bonds
- Factory reset

- - -

## [dfu.html](https://taichunmin.idv.tw/chameleon-ultra.js/dfu.html)

A tool to update ChameleonUltra firmware.

![](https://i.imgur.com/yYsKXgx.png)

<h3>Features</h3>

- Select tag to update firmware

<h3>Related links</h3>

- [Uploading the code in DFU mode](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/development.md#uploading-the-code-in-dfu-mode)
- [nRF5 SDK: DFU protocol](https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html)
- [GitHub: GameTec-live/ChameleonUltraGUI](https://github.com/GameTec-live/ChameleonUltraGUI/blob/main/chameleonultragui/lib/bridge/dfu.dart)
- [GitHub: thegecko/web-bluetooth-dfu](https://github.com/thegecko/web-bluetooth-dfu)

- - -

## [mfkey32.html](https://taichunmin.idv.tw/chameleon-ultra.js/mfkey32.html)

A ChameleonUltra tool to detect the mifare key that reader is authenticating (a.k.a. MFKey32).

![](https://i.imgur.com/TQC83i4.png)

<h3>Features</h3>

- Emulate a mifare card and enable detect mode
- Recover the mifare key that reader is authenticating
- Check the mifare key is correct or not

<details>

<summary>Previous versions: </summary>

## [mfkey32-v1.html](https://taichunmin.idv.tw/chameleon-ultra.js/mfkey32-v1.html)

![](https://i.imgur.com/OyZ4E3Z.png)

<h3>Features</h3>

- Emulate a mifare card and enable detect mode
- Recover the mifare key that reader is authenticating
- Check the mifare key is correct or not

</details>

<h3>Related links</h3>

- [Recovering keys with MFKey32 | Flipper Zero](https://docs.flipper.net/nfc/mfkey32)
- [How to use MFKEY32 | ChameleonUltraGUI](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/chameleonultragui.md#how-to-use-mfkey32)
- [MFKey32 example trace | proxmark3](https://github.com/RfidResearchGroup/proxmark3/blob/master/tools/mfkey/example_trace.txt)

- - -

## [mifare1k.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare1k.html)

A ChameleonUltra tool for mifare class 1k.

![](https://i.imgur.com/zJ1qIdj.png)

<h3>Features</h3>

- Load/Emulate for slot of ChameleonUltra.
- Read/Write for Mifare Gen1a Tag (UID).
- Read/Write for Mifare Classic 1k, Gen2 Tag (CUID, FUID, UFUID).
- Import/Export dump for `.json`, `.bin`, `.eml`, `.mct` files.

- - -

## [mifare-keychain.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-keychain.html)

Keep a few mifare tags in browser with indexedDB.

![](https://i.imgur.com/1Xe3Fgs.png)

<h3>Features</h3>

- Save/Load tags to/from browser's indexedDB.
- Export/Import tags with CSV format.
- Read/Emulate tag with ChameleonUltra slot.
- Scan Anti-Collision data from tag.
- Write block0 to magic tag. (Gen1a, Gen2)

- - -

## [hf14a-scanner.html](https://taichunmin.idv.tw/chameleon-ultra.js/hf14a-scanner.html)

A tool to scan uid of ISO/IEC 14443-A tags.

![](https://i.imgur.com/8QfzaaZ.png)

<h3>Features</h3>

- Continuous scan `UID`, `ATQA`, `SAK` for ISO/IEC 14443-A tags.

- - -

## [mifare-xiaomi.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-xiaomi.html)

A tool for Xiaomi Watch to clone encrypted Mifare Classic tag.

![](https://i.imgur.com/M39Y0Be.png)

<h3>Features</h3>

- Import/Export dump for `.json`, `.bin`, `.eml`, `.mct` files.
- Emulate ChameleonUltra as non-encrypted Mifare Classic tag.
- Write/Verify/Read for Xiaomi Watch.

- - -

## [mifare-value.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare-value.html)

在台灣有些系統會使用 MIFARE Classic 卡片的 value block 來儲存餘額，value block 的 increment/decrement/restore 指令的資料是由 2 個部分所組成，在第 2 部分傳送完成後卡片不會回傳 ACK，所以讀卡機如果在 Timeout 之前沒有收到 NACK，就可以視為執行成功並繼續執行下一個指令。但有些魔術卡需要更多時間來完成指令，否則就會執行失敗，這個工具可以讓你測試卡片是否能夠成功執行 value block 的指令。

In Taiwan, some systems use the value block of MIFARE Classic cards to store balances. The data for the value block's increment/decrement/restore commands consists of two parts. After the second part is transmitted, the card will not return ACK. Therefore, if the reader does not receive a NACK before timeout, it can be considered successful and proceed to the next command. However, some magic cards needs more time to complete the value block's command, otherwise the command will fail. This tool allows you to test whether the card can successfully execute the value block commands.

![](https://i.imgur.com/jJ3pNvn.png)

<h3>Features</h3>

- Get/Set for mifare value block
- Increase/Decrease/Restore for mifare value block

- - -

## [lf-em410x.html](https://taichunmin.idv.tw/chameleon-ultra.js/lf-em410x.html)

A tool to emulate EM410x tag, scan from EM410x tag and write to T55xx tag.

![](https://i.imgur.com/EjLG2Zo.png)

<h3>Features</h3>

- Load/Emulate a EM410x tag
- Scan from EM410x tag
- Write to T55xx tag and set as EM410x tag

- - -

## [mifare1k-acls.html](https://taichunmin.idv.tw/chameleon-ultra.js/mifare1k-acls.html)

This tool allows you to calculate access bits and vice versa parse access bits.

![](https://i.imgur.com/hrUXvtO.png)

<h3>Features</h3>

- Decode/Encode the ACLs (Access Bits) of Mifare 1k.
