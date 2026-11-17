# Device settings: cmd 1039–1043

- Cmd: GET/SET_SLEEP_TIMEOUT (1039/1040), GET/SET_LONG_PRESS_THRESHOLD (1041/1042), GET_BATTERY_INFO_EX (1043).
- SDK: cmdGetSleepTimeout / cmdSetSleepTimeout (sec, u8), cmdGetButtonLongPressThreshold / cmdSetButtonLongPressThreshold (ms, u16be), cmdGetBatteryInfoEx -> { voltage, level, condition: BatteryCondition }.
- Only type-check (u8/u16 integer); valid ranges are left to firmware and not documented (firmware may change them).
- No protocol.md link (ChameleonUltraDocs not updated yet).
- device-settings.pug: number inputs (sec/ms) without min/max; batteryCondition in Device Info; unsupported cmds (isCmdSupported) show `unsupported` and are skipped on save.
