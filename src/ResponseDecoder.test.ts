import * as sut from './ResponseDecoder'
import { Buffer } from '@taichunmin/buffer'

describe('is not buffer', () => {
  test.each([
    { name: 'SlotInfo.fromCmd1019', fn: sut.SlotInfo.fromCmd1019 },
    { name: 'SlotFreqIsEnable.fromCmd1023', fn: sut.SlotFreqIsEnable.fromCmd1023 },
    { name: 'BatteryInfo.fromCmd1025', fn: sut.BatteryInfo.fromCmd1025 },
    { name: 'DeviceSettings.fromCmd1034', fn: sut.DeviceSettings.fromCmd1034 },
    { name: 'Hf14aAntiColl.fromCmd2000', fn: sut.Hf14aAntiColl.fromCmd2000 },
    { name: 'Mf1AcquireStaticNestedRes.fromCmd2003', fn: sut.Mf1AcquireStaticNestedRes.fromCmd2003 },
    { name: 'Mf1DarksideRes.fromCmd2004', fn: sut.Mf1DarksideRes.fromCmd2004 },
    { name: 'Mf1NtDistanceRes.fromCmd2005', fn: sut.Mf1NtDistanceRes.fromCmd2005 },
    { name: 'Mf1NestedRes.fromCmd2006', fn: sut.Mf1NestedRes.fromCmd2006 },
    { name: 'Mf1CheckKeysOfSectorsRes.fromCmd2012', fn: sut.Mf1CheckKeysOfSectorsRes.fromCmd2012 },
    { name: 'Mf1DetectionLog.fromBuffer', fn: sut.Mf1DetectionLog.fromBuffer },
    { name: 'Mf1DetectionLog.fromCmd4006', fn: sut.Mf1DetectionLog.fromCmd4006 },
    { name: 'Mf1EmuSettings.fromCmd4009', fn: sut.Mf1EmuSettings.fromCmd4009 },
  ])('$name should throw error', ({ name, fn }) => {
    expect.hasAssertions()
    try {
      fn('not a buffer' as any)
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError)
      expect(err.message).toMatch(/should be a Buffer/)
    }
  })

  test.each([
    { name: 'SlotInfo.fromCmd1019', fn: sut.SlotInfo.fromCmd1019 },
    { name: 'SlotFreqIsEnable.fromCmd1023', fn: sut.SlotFreqIsEnable.fromCmd1023 },
    { name: 'BatteryInfo.fromCmd1025', fn: sut.BatteryInfo.fromCmd1025 },
    { name: 'DeviceSettings.fromCmd1034', fn: sut.DeviceSettings.fromCmd1034 },
    { name: 'Mf1DarksideRes.fromCmd2004', fn: sut.Mf1DarksideRes.fromCmd2004 },
    { name: 'Mf1NtDistanceRes.fromCmd2005', fn: sut.Mf1NtDistanceRes.fromCmd2005 },
    { name: 'Mf1CheckKeysOfSectorsRes.fromCmd2012', fn: sut.Mf1CheckKeysOfSectorsRes.fromCmd2012 },
    { name: 'Mf1DetectionLog.fromBuffer', fn: sut.Mf1DetectionLog.fromBuffer },
  ])('$name should throw error', ({ name, fn }) => {
    expect.hasAssertions()
    try {
      fn(new Buffer(0))
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError)
      expect(err.message).toMatch(/should be a Buffer/)
    }
  })
})

describe('Hf14aAntiColl', () => {
  test('fromBuffer should throw invalid length error', () => {
    expect.hasAssertions()
    try {
      sut.Hf14aAntiColl.fromBuffer(Buffer.from('01', 'hex'))
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toMatch(/invalid length of/)
    }
  })

  test('fromBuffer should throw invalid length error', () => {
    expect.hasAssertions()
    try {
      sut.Hf14aAntiColl.fromBuffer(Buffer.from('040102030404000801', 'hex'))
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toMatch(/invalid length of/)
    }
  })
})

describe('Mf1DarksideRes', () => {
  test('fromBuffer should throw invalid length error', () => {
    const actual = sut.Mf1DarksideRes.fromCmd2004(Buffer.from('01', 'hex'))
    expect(actual).toMatchObject({ status: 1 })
  })
})
