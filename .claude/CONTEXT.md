# chameleon-ultra.js

SDK for driving a ChameleonUltra / ChameleonLite device over its binary command protocol.

## Language

### Device settings

**Device Settings**:
Persistent device-wide configuration (animation, button actions, BLE pairing, sleep timeout, long press threshold) that only survives a reboot after being saved.
_Avoid_: Config, preferences

**Sleep Timeout**:
How many seconds the device stays awake after being woken by a button press before deep sleeping; not applied when woken by an RF field.
_Avoid_: Wake timeout, idle timeout

**Long Press Threshold**:
How many milliseconds a button must be held to count as a long press instead of a short press.
_Avoid_: Long press duration

### Battery

**Battery Condition**:
A coarse five-level rating (Critical, Low, Fair, Good, Excellent) of the battery's remaining charge, derived by the firmware from the battery level.
_Avoid_: Battery health (it does not measure cell wear)
