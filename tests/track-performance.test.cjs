const test = require('node:test');
const assert = require('node:assert/strict');

function loadTrack(options = {}) {
  const modulePath = require.resolve('../utils/track.js');
  delete require.cache[modulePath];
  const timers = [];
  let reads = 0;
  const writes = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalGetApp = global.getApp;
  const originalWx = global.wx;
  global.setTimeout = callback => {
    const timer = { callback, cleared: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = timer => { if (timer) timer.cleared = true; };
  global.getApp = () => ({ globalData: { enterScene: 1001 } });
  global.wx = {
    getStorageSync() {
      reads++;
      if (options.readError) throw new Error('storage unavailable');
      return options.saved || [];
    },
    setStorageSync(key, value) {
      if (options.writeError) throw new Error('storage full');
      writes.push({ key, value: JSON.parse(JSON.stringify(value)) });
    }
  };
  const track = require(modulePath);
  return {
    track, timers, writes, reads: () => reads,
    restore() {
      track.resetForTests();
      delete require.cache[modulePath];
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      global.getApp = originalGetApp;
      global.wx = originalWx;
    }
  };
}

test('events are buffered and written once after the short delay', () => {
  const env = loadTrack();
  try {
    env.track.report(env.track.EVENTS.HALL_VIEW);
    env.track.report(env.track.EVENTS.DETAIL_VIEW, { testId: 'mbti', resultType: 'private', recordId: 'private' });
    env.track.report(env.track.EVENTS.TEST_ABORT, { testId: 'mbti', reachedIndex: 3, unanswered: 4 });
    assert.equal(env.reads(), 0);
    assert.equal(env.writes.length, 0);
    assert.equal(env.timers.length, 1);

    env.timers[0].callback();
    assert.equal(env.reads(), 1);
    assert.equal(env.writes.length, 1);
    assert.equal(env.writes[0].key, 'trackLog');
    assert.equal(env.writes[0].value.length, 3);
    assert.deepEqual(env.writes[0].value[1].p, { enterScene: 1001, testId: 'mbti' });
    assert.equal(env.writes[0].value[2].s, 1001);
  } finally { env.restore(); }
});

test('the in-memory cache avoids repeated reads and keeps only the newest 100 events', () => {
  const saved = Array.from({ length: 98 }, (_, index) => ({ e: `saved-${index}` }));
  const env = loadTrack({ saved });
  try {
    for (let index = 0; index < 5; index++) env.track.report('new', { reachedIndex: index });
    env.track.flushLocal();
    assert.equal(env.reads(), 1);
    assert.equal(env.writes[0].value.length, 100);
    assert.equal(env.writes[0].value[0].e, 'saved-3');

    env.track.report('later');
    env.track.flushLocal();
    assert.equal(env.reads(), 1);
    assert.equal(env.writes.length, 2);
    assert.equal(env.writes[1].value.at(-1).e, 'later');
  } finally { env.restore(); }
});

test('diagnostic storage failures never escape into the assessment flow', () => {
  const env = loadTrack({ readError: true });
  try {
    assert.doesNotThrow(() => env.track.report('offline'));
    assert.doesNotThrow(() => env.track.flushLocal());
    assert.equal(env.writes.length, 0);
  } finally { env.restore(); }
});

test('clearing local data discards buffered events before they can be restored', () => {
  const env = loadTrack();
  try {
    env.track.report('before-delete');
    assert.equal(env.writes.length, 0);
    env.track.resetLocalBuffer();
    env.timers[0].callback();
    assert.equal(env.writes.length, 0);
  } finally { env.restore(); }
});
