// Personal cards are created only after an explicit tap. Original artwork stays
// remote; the exported JPEG is a temporary, device-local user creation.
const WIDTH = 500;
const HEIGHT = 400;
const PORTRAIT_WIDTH = 750;
const PORTRAIT_HEIGHT = 1000;
const IMAGE_TIMEOUT_MS = 8000;

function cancelled(options) {
  if (options.isCancelled && options.isCancelled()) {
    const error = new Error('已取消本次结果卡制作');
    error.cancelled = true;
    throw error;
  }
}

function findCanvas(page, selector) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery();
    const scoped = query.in ? query.in(page) : query;
    scoped.select(selector).fields({ node: true, size: true }).exec(result => {
      const canvas = result && result[0] && result[0].node;
      if (canvas) resolve(canvas);
      else reject(new Error('结果卡画布暂时未准备好，请再试一次。'));
    });
  });
}

function loadArtwork(canvas, source) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, image) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('主题画面加载超时')), IMAGE_TIMEOUT_MS);
    try {
      const image = canvas.createImage();
      image.onload = () => image.width > 0 && image.height > 0
        ? finish(null, image) : finish(new Error('主题画面尺寸无效'));
      image.onerror = () => finish(new Error('主题画面暂时不可用'));
      image.src = source;
    } catch (error) { finish(error); }
  });
}

function fitText(ctx, value, width) {
  const text = Array.from(String(value || ''));
  if (ctx.measureText(text.join('')).width <= width) return text.join('');
  while (text.length && ctx.measureText(text.join('') + '…').width > width) text.pop();
  return text.join('') + '…';
}

function lines(ctx, value, x, y, width, step, maximum) {
  const text = Array.from(String(value || ''));
  let current = '', row = 0;
  for (let index = 0; index < text.length; index++) {
    if (ctx.measureText(current + text[index]).width > width && current) {
      ctx.fillText(current, x, y + row * step);
      current = '';
      row++;
      if (row === maximum - 1) {
        ctx.fillText(fitText(ctx, text.slice(index).join(''), width), x, y + row * step);
        return;
      }
    }
    current += text[index];
  }
  if (current) ctx.fillText(current, x, y + row * step);
}

function fallbackTree(ctx, color, center = 404, baseline = 337, scale = 1) {
  const xAt = value => center + (value - 404) * scale;
  const yAt = value => baseline + (value - 337) * scale;
  ctx.strokeStyle = '#b69b77'; ctx.lineWidth = 7 * scale;
  ctx.beginPath(); ctx.moveTo(xAt(404), yAt(331)); ctx.lineTo(xAt(404), yAt(241));
  ctx.moveTo(xAt(404), yAt(286)); ctx.lineTo(xAt(375), yAt(258));
  ctx.moveTo(xAt(404), yAt(276)); ctx.lineTo(xAt(435), yAt(245)); ctx.stroke();
  ctx.fillStyle = color || '#8fb9df';
  [[374, 244, 22], [404, 221, 29], [435, 235, 23], [385, 271, 20], [425, 267, 24]].forEach(([x, y, radius]) => {
    ctx.beginPath(); ctx.arc(xAt(x), yAt(y), radius * scale, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#d9e7ef'; ctx.fillRect(xAt(372), yAt(333), 65 * scale, 4 * scale);
}
function chartCaption(options) {
  return options.mode === 'priority' ? '本次相对优先度' : options.mode === 'profile'
    ? '本次自评位置' : '本次偏好清晰度';
}
function chartAmount(item, mode) {
  const percent = Math.max(0, Math.min(100, Number(item.percent) || 0));
  return mode === 'profile' || mode === 'priority' ? percent : Math.round(Math.abs(percent - 50) * 2);
}
function drawArtwork(ctx, artwork, x, y, width, height) {
  const scale = Math.min(width / artwork.width, height / artwork.height);
  const fittedWidth = artwork.width * scale, fittedHeight = artwork.height * scale;
  ctx.drawImage(artwork, x + (width - fittedWidth) / 2, y + (height - fittedHeight) / 2, fittedWidth, fittedHeight);
}

function drawChart(ctx, options) {
  const dimensions = (options.dimensions || []).slice(0, 5);
  ctx.fillStyle = '#54769e'; ctx.font = '13px sans-serif';
  const caption = chartCaption(options);
  ctx.fillText(dimensions.length ? caption : '本次探索关键词', 28, 203);
  if (!dimensions.length) {
    ctx.fillStyle = '#527aa8'; ctx.font = 'bold 29px sans-serif';
    ctx.fillText(options.symbol || '✦', 35, 261);
    ctx.font = '15px sans-serif';
    (options.keywords || ['认真观察', '保留自己的节奏']).slice(0, 3).forEach((word, index) => {
      ctx.fillText(fitText(ctx, word, 220), 28, 300 + index * 19);
    });
    return;
  }
  dimensions.forEach((item, index) => {
    const amount = chartAmount(item, options.mode);
    const y = 226 + index * 25;
    ctx.fillStyle = '#3f628f'; ctx.font = '12px sans-serif';
    ctx.fillText(fitText(ctx, item.label, 150), 28, y);
    ctx.fillText(Number.isInteger(item.rank) ? `第 ${item.rank} 顺位` : `${amount}%`, 225, y);
    ctx.fillStyle = '#e1ebf9'; ctx.fillRect(28, y + 5, 245, 5);
    ctx.fillStyle = options.color || '#7fa9e4'; ctx.fillRect(28, y + 5, 245 * amount / 100, 5);
  });
}

function drawChat(ctx, options, artwork) {
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, options.pale || '#eff5ff'); background.addColorStop(1, '#ffffff');
  ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.74)'; ctx.fillRect(16, 16, 468, 368);
  ctx.fillStyle = '#54749c'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('人格测试树', 28, 36);
  ctx.font = '12px sans-serif'; ctx.fillText(fitText(ctx, options.testName, 442), 28, 55);
  ctx.fillStyle = '#214a7e'; ctx.font = 'bold 28px sans-serif';
  lines(ctx, options.title || '这一次的我', 28, 95, 438, 33, 2);
  ctx.fillStyle = '#6b839f'; ctx.font = '16px sans-serif';
  lines(ctx, options.tagline || '每一个认真回答，都值得收藏。', 28, 151, 281, 23, 2);
  drawChart(ctx, options);
  ctx.fillStyle = options.pale || '#eef5ff'; ctx.fillRect(312, 181, 165, 174);
  if (artwork) {
    drawArtwork(ctx, artwork, 320, 183, 150, 152);
  } else fallbackTree(ctx, options.color);
  ctx.fillStyle = '#7690ad'; ctx.font = '11px sans-serif';
  ctx.fillText(fitText(ctx, options.themeName || '我的探索之树', 146), 321, 347);
  ctx.fillStyle = '#8a9cb3'; ctx.font = '10px sans-serif';
  ctx.fillText('本次自评 · 不代表能力或人群排名', 28, 375);
  ctx.fillText(fitText(ctx, options.date || '', 150), 315, 375);
}

function drawPortrait(ctx, options, artwork) {
  const background = ctx.createLinearGradient(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  background.addColorStop(0, options.pale || '#edf5ff'); background.addColorStop(1, '#f6faff');
  ctx.fillStyle = background; ctx.fillRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.fillRect(20, 20, 710, 960);
  ctx.fillStyle = '#6787af'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('人格测试树', 48, 58);
  ctx.font = '16px sans-serif'; ctx.fillText('收集每一种，独特的你', 447, 58);
  ctx.fillStyle = '#849bb6'; ctx.font = '18px sans-serif';
  ctx.fillText(fitText(ctx, options.testName, 650), 48, 99);
  ctx.fillStyle = '#244c7c'; ctx.font = 'bold 44px sans-serif';
  lines(ctx, options.title || '这一次的我', 46, 157, 654, 52, 2);
  ctx.fillStyle = '#6d88a7'; ctx.font = '24px sans-serif';
  lines(ctx, options.tagline || '每一个认真回答，都值得收藏。', 48, 250, 650, 31, 2);
  ctx.fillStyle = options.pale || '#edf5ff'; ctx.fillRect(32, 305, 686, 300);
  // Artwork is contained as a whole, even when future remote themes change size.
  if (artwork) drawArtwork(ctx, artwork, 70, 315, 610, 250);
  else fallbackTree(ctx, options.color, 375, 573, 1.95);
  ctx.fillStyle = '#6b89ac'; ctx.font = '18px sans-serif';
  ctx.fillText(fitText(ctx, options.themeName || '我的探索之树', 610), 70, 588);
  const dimensions = (options.dimensions || []).slice(0, 5);
  ctx.fillStyle = '#4d709e'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(dimensions.length ? chartCaption(options) : '本次探索关键词', 48, 650);
  if (dimensions.length) {
    dimensions.forEach((item, index) => {
      const amount = chartAmount(item, options.mode);
      const y = 689 + index * 43;
      ctx.fillStyle = '#506f99'; ctx.font = '19px sans-serif';
      ctx.fillText(fitText(ctx, item.label, 450), 48, y);
      const amountText = Number.isInteger(item.rank) ? `第 ${item.rank} 顺位` : `${amount}%`;
      ctx.fillText(amountText, 605, y);
      ctx.fillStyle = '#e3edf9'; ctx.fillRect(48, y + 10, 654, 7);
      ctx.fillStyle = options.color || '#80aee9'; ctx.fillRect(48, y + 10, 654 * amount / 100, 7);
    });
  } else {
    ctx.font = '26px sans-serif'; ctx.fillStyle = '#6383a7';
    (options.keywords || ['认真观察', '保留自己的节奏']).slice(0, 3).forEach((word, index) => {
      ctx.fillText(fitText(ctx, word, 600), 48, 710 + index * 52);
    });
  }
  ctx.fillStyle = '#8a9db5'; ctx.font = '16px sans-serif';
  ctx.fillText('本次自评 · 不代表能力或人群排名', 48, 934);
  ctx.fillText(fitText(ctx, options.date || '', 650), 48, 960);
}

async function buildResultShareCard(page, options) {
  cancelled(options);
  const canvas = await findCanvas(page, options.selector || '#resultShareCanvas');
  cancelled(options);
  let artwork = null;
  let artFallback = false;
  if (options.heroUrl) {
    try { artwork = await loadArtwork(canvas, options.heroUrl); }
    catch (error) { artFallback = true; }
  }
  cancelled(options);
  const portrait = options.format === 'portrait';
  const width = portrait ? PORTRAIT_WIDTH : WIDTH, height = portrait ? PORTRAIT_HEIGHT : HEIGHT;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境暂时无法制作结果卡，请在手机微信中重试。');
  if (portrait) drawPortrait(ctx, options, artwork);
  else drawChat(ctx, options, artwork);
  cancelled(options);
  return new Promise((resolve, reject) => wx.canvasToTempFilePath({
    canvas, x: 0, y: 0, width, height, destWidth: width, destHeight: height,
    fileType: 'jpg', quality: .9,
    success: result => result.tempFilePath ? resolve({ path: result.tempFilePath, artFallback })
      : reject(new Error('结果卡暂时未能导出，请再试一次。')),
    fail: () => reject(new Error('结果卡暂时未能导出，请再试一次。'))
  }, page));
}

module.exports = { buildResultShareCard, IMAGE_TIMEOUT_MS };
