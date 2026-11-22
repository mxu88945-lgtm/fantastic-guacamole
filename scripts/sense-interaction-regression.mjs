import assert from 'node:assert/strict';
import { DEFAULT_SENSE_SETTINGS, mergeSensorEvents, acceptSensorBundle, permissionMessage, sensorEventPrompt, labelForEvent } from '../src/sense-interaction.js';
assert.deepEqual(DEFAULT_SENSE_SETTINGS, { enabled: false, blow: false, shake: false, rotation: false, longPress: false });
const bundle = mergeSensorEvents([{ event: 'device_shaken', timestamp: 1000 }, { event: 'screen_touched', timestamp: 3200 }], 4000);
assert.equal(bundle.events.length, 2); assert.match(sensorEventPrompt(bundle), /<sensor_event>/); assert.equal(labelForEvent(bundle.events[0]), '（你晃了晃手机）');
const state = { lastReactionAt: 0, replyBusy: false };
assert.equal(acceptSensorBundle(bundle, state, 1000), true); assert.equal(acceptSensorBundle(bundle, state, 5000), false); state.replyBusy = true; assert.equal(acceptSensorBundle(bundle, state, 25000), false);
assert.match(permissionMessage(new Error('permission denied')), /请在 iPhone 设置里允许/);
console.log('sense interaction regression: merge, switches, cooldown and permission checks passed');
