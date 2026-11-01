const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../utils/share-card.js');
let drawCalls, exportOptions;

beforeEach(() => {
  drawCalls = [];
  exportOptions = null;
  const gradient = { addColorStop() {} };
  const context = {
    createLinearGradient: () => gradient,
    fillRect() {}, fillText() {},
    measureText: value => ({ width: String(value).length * 18 }),
    drawImage: (...args) => drawCalls.push(args)
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => context,
    createImage: () => {
      const image = { width: 1254, height: 1254 };
      Object.defineProperty(image, 'src', {
        set(value) { image.url = value; queueMicrotask(() => image.onload()); }
      });
      return image;
    }
  };
  global.wx = {
    createSelectorQuery: () => ({
      in() { return this; },
      select() { return this; },
      fields() { return this; },
      exec(callback) { callback([{ node: canvas, width: 500, height: 400 }]); }
    }),
    canvasToTempFilePath: options => {
      exportOptions = options;
      options.success({ tempFilePath: '/tmp/tree-share.jpg' });
    }
  };
  delete require.cache[modulePath];
});

afterEach(() => { delete global.wx; });

test('share card is exported at WeChat 5:4 and contains the complete theme art', async () => {
  const { buildShareCard } = require(modulePath);
  const result = await buildShareCard({}, {
    heroUrl: 'cloud://theme.webp', title: '柔软的冒险家', subtitle: '收集每一种独特的你'
  });
  assert.equal(result, '/tmp/tree-share.jpg');
  assert.equal(exportOptions.width / exportOptions.height, 5 / 4);
  assert.equal(exportOptions.destWidth, 500);
  assert.equal(exportOptions.destHeight, 400);
  const [, x, y, width, height] = drawCalls[0];
  assert.ok(x >= 225 && y >= 30);
  assert.ok(x + width <= 490 && y + height <= 370);
  assert.equal(width, height, 'square source remains uncropped');
});

test('share card uses the bundled 5:4 cover when no cloud art is available', async () => {
  const { buildShareCard, DEFAULT_SHARE_IMAGE } = require(modulePath);
  assert.equal(await buildShareCard({}, {}), DEFAULT_SHARE_IMAGE);
  assert.equal(exportOptions, null);
});
