const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const file = path.resolve(__dirname, '../app.js');
  const timers = new Map();
  const scheduledSyncs = [];
  const enterOptions = [];
  let timerId = 0;
  let app;
  const cloudSync = { schedule: (delay, options = {}) => scheduledSyncs.push({ delay, ifStale: options.ifStale === true }) };
  const wx = {
    getEnterOptionsSync() {
      const index = enterOptions.length + 1;
      const options = { scene: 1000 + index, path: `/entry-${index}`, query: { index } };
      enterOptions.push(options);
      return options;
    }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    App: options => { app = options; },
    wx,
    Promise,
    require: specifier => {
      if (specifier === './utils/cloud-sync.js') return cloudSync;
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  }, { filename: file });
  return { app, timers, scheduledSyncs, enterOptions };
}

test('launch lets the first page paint before starting default cloud backup', async () => {
  const { app, timers, enterOptions } = fixture();
  let backupStarts = 0;
  app.startDefaultCloudBackup = () => {
    backupStarts += 1;
    return Promise.resolve(true);
  };

  app.onLaunch.call(app);

  assert.equal(backupStarts, 0, 'privacy and cloud work must not run in the launch stack');
  assert.equal(enterOptions.length, 1);
  assert.equal(app.globalData.enterScene, 1001);
  assert.equal(timers.size, 1);
  const [timerId, timer] = [...timers.entries()][0];
  assert.equal(timer.delay, 900);
  assert.equal(app._backupStartTimer, timerId);

  timer.callback();
  timers.delete(timerId);
  assert.equal(backupStarts, 1);
  assert.equal(await app.globalData.cloudBackupReady, true);
  assert.equal(app._backupStartTimer, null);
  assert.equal(backupStarts, 1, 'the deferred initializer is single-use');
});

test('the launch show is deduplicated and later foreground entries sync after 800ms', () => {
  const { app, scheduledSyncs, enterOptions } = fixture();
  app.startDefaultCloudBackup = () => Promise.resolve(true);
  app.onLaunch.call(app);

  app.onShow.call(app);
  assert.deepEqual(scheduledSyncs, []);
  assert.equal(enterOptions.length, 1, 'onLaunch already captured the initial entry');

  app.onShow.call(app);
  assert.deepEqual(scheduledSyncs, [{ delay: 800, ifStale: true }]);
  assert.equal(enterOptions.length, 2);
  assert.equal(app.globalData.enterScene, 1002);

  app.onShow.call(app);
  assert.deepEqual(scheduledSyncs, [{ delay: 800, ifStale: true }, { delay: 800, ifStale: true }]);
  assert.equal(enterOptions.length, 3, 'each real foreground entry refreshes its scene');
});
