// User-created temporary JPEG only. This helper never fetches art or reads
// records; its caller supplies the dimensions the current report may display.
const WIDTH = 750;
const HEIGHT = 1000;
const NATIVE_TIMEOUT_MS = 6000;
const COLORS = { before: '#91a8bf', after: '#4b91df', ink: '#294f7b', muted: '#8196ad', track: '#e7eff8' };

function cancellation(isCancelled) {
  if (isCancelled && isCancelled()) {
    const error = new Error('已取消本次变化卡制作');
    error.cancelled = true;
    throw error;
  }
}

function nativeCall(run, message, isCancelled) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { cancellation(isCancelled); }
      catch (cancelled) { reject(cancelled); return; }
      if (error) reject(new Error(message)); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('timeout')), NATIVE_TIMEOUT_MS);
    try { run(value => finish(null, value), error => finish(error || new Error('native call failed'))); }
    catch (error) { finish(error); }
  });
}

function fitText(ctx, value, width) {
  const characters = Array.from(String(value || ''));
  if (ctx.measureText(characters.join('')).width <= width) return characters.join('');
  while (characters.length && ctx.measureText(characters.join('') + '…').width > width) characters.pop();
  return characters.join('') + '…';
}

function drawLines(ctx, value, x, y, width, lineHeight, limit = 2) {
  const text = Array.from(String(value || ''));
  const closing = /^[，。！？；：、,.!?;:%）】》〉」』’”]$/;
  const opening = /^[（【《〈「『‘“]$/;
  let index = 0, row = 0;
  while (index < text.length && row < limit) {
    if (row === limit - 1) {
      ctx.fillText(fitText(ctx, text.slice(index).join(''), width), x, y + row * lineHeight);
      return;
    }
    let end = index + 1;
    while (end < text.length && ctx.measureText(text.slice(index, end + 1).join('')).width <= width) end++;
    if (end < text.length && row === limit - 2 && text.length - end < 4) end = Math.max(index + 1, text.length - 4);
    while (end > index + 1 && (closing.test(text[end] || '') || opening.test(text[end - 1]))) end--;
    ctx.fillText(text.slice(index, end).join(''), x, y + row * lineHeight);
    index = end; row++;
  }
}

function panel(ctx, x, y, width, height, color, radius = 18) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath(); ctx.fill();
}

function number(value) { return String(Math.round(value * 100) / 100); }

function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.testName !== 'string' || !snapshot.testName.trim() ||
      !Array.isArray(snapshot.dimensions) || !snapshot.dimensions.length || snapshot.dimensions.length > 9) return false;
  const ids = new Set();
  return snapshot.dimensions.every(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.label !== 'string' || !item.label.trim() ||
        !Number.isFinite(item.before) || item.before < 0 || item.before > 100 ||
        !Number.isFinite(item.after) || item.after < 0 || item.after > 100) return false;
    ids.add(item.id); return true;
  });
}

function drawIdentity(ctx, title, date, label, x, color) {
  panel(ctx, x, 202, 320, 150, '#f0f6fd');
  ctx.fillStyle = color; ctx.font = 'bold 18px sans-serif'; ctx.fillText(label, x + 20, 231);
  ctx.fillStyle = COLORS.ink; ctx.font = 'bold 25px sans-serif';
  drawLines(ctx, title || '一次认真回答的我', x + 20, 268, 280, 31);
  ctx.fillStyle = COLORS.muted; ctx.font = '17px sans-serif';
  ctx.fillText(fitText(ctx, date || '本机记录', 280), x + 20, 332);
}

function draw(ctx, snapshot) {
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#e7f2ff'); background.addColorStop(1, '#fafcff');
  ctx.fillStyle = background; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panel(ctx, 20, 20, 710, 960, '#ffffff', 26);
  ctx.strokeStyle = '#dceafa'; ctx.lineWidth = 2;
  for (const radius of [12, 22, 32]) {
    ctx.beginPath(); ctx.arc(667, 72, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#6689b0'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('人格测试树', 44, 61);
  ctx.font = '15px sans-serif'; ctx.fillText('把两次认真回答，收藏进自己的年轮', 44, 87);
  const changed = snapshot.dimensions.some(item => item.after !== item.before);
  ctx.fillStyle = COLORS.ink; ctx.font = 'bold 34px sans-serif';
  ctx.fillText(changed ? '这段时间，我有了这些变化' : '把这两次的我，一起收藏', 44, 142);
  ctx.fillStyle = '#7591af'; ctx.font = '21px sans-serif';
  ctx.fillText(fitText(ctx, snapshot.testName, 658), 46, 178);
  drawIdentity(ctx, snapshot.beforeTitle, snapshot.beforeDate, '之前的我', 46, COLORS.before);
  drawIdentity(ctx, snapshot.afterTitle, snapshot.afterDate, '这次的我', 384, COLORS.after);
  ctx.fillStyle = COLORS.ink; ctx.font = 'bold 22px sans-serif'; ctx.fillText('两次自评的位置', 48, 389);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = COLORS.before; ctx.fillRect(48, 405, 23, 6); ctx.fillText('之前', 80, 414);
  ctx.fillStyle = COLORS.after; ctx.fillRect(156, 405, 23, 6); ctx.fillText('这次', 188, 414);
  ctx.fillStyle = COLORS.muted; ctx.textAlign = 'right'; ctx.fillText('变化用百分点表示', 702, 414); ctx.textAlign = 'left';
  const count = snapshot.dimensions.length;
  const step = Math.min(96, Math.floor(390 / count));
  const compact = count > 5;
  snapshot.dimensions.forEach((item, index) => {
    const y = 452 + index * step;
    const delta = Math.round((item.after - item.before) * 100) / 100;
    // Dense charts put labels, bars and deltas in separate columns. Stacking
    // all three vertically needs more than a nine-row card can provide.
    const labelY = compact ? y + 12 : y;
    const barX = compact ? 205 : 50;
    const barWidth = compact ? 305 : 552;
    ctx.fillStyle = '#486e99'; ctx.font = `${compact ? 18 : 20}px sans-serif`;
    ctx.fillText(fitText(ctx, item.label, compact ? 130 : 410), 50, labelY);
    ctx.font = `${compact ? 14 : 16}px sans-serif`; ctx.textAlign = 'right';
    ctx.fillText(delta === 0 ? compact ? '0 个百分点' : '保持接近 · 0 个百分点'
      : `${delta > 0 ? '+' : '−'}${number(Math.abs(delta))} 个百分点`, 700, labelY);
    ctx.textAlign = 'left';
    const offsets = compact ? [0, 17] : [10, 25];
    for (const [key, offset, color] of [['before', offsets[0], COLORS.before], ['after', offsets[1], COLORS.after]]) {
      ctx.fillStyle = COLORS.track; ctx.fillRect(barX, y + offset, barWidth, 6);
      ctx.fillStyle = color; ctx.fillRect(barX, y + offset, barWidth * item[key] / 100, 6);
      ctx.font = `${compact ? 13 : 15}px sans-serif`; ctx.textAlign = 'right';
      ctx.fillText(`${number(item[key])}%`, compact ? 565 : 697, y + offset + 6); ctx.textAlign = 'left';
    }
  });
  if (count < 4) {
    ctx.fillStyle = '#8da6c1'; ctx.font = '21px sans-serif';
    ctx.fillText('数字之外，也记得你正在经历的生活。', 56, 790);
  }
  ctx.strokeStyle = '#e7eef7'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(48, 864); ctx.lineTo(702, 864); ctx.stroke();
  ctx.fillStyle = COLORS.muted; ctx.font = '16px sans-serif';
  drawLines(ctx, snapshot.note || '这是两次自评位置的差异，不代表能力升降，也不是人群排名。', 48, 894, 654, 24);
  ctx.font = '15px sans-serif'; ctx.fillText('每一片探索叶，每一圈自己的年轮。', 48, 958);
}

async function buildComparisonShareCard(page, snapshot, isCancelled) {
  cancellation(isCancelled);
  if (!validSnapshot(snapshot)) throw new Error('变化数据暂不完整，请重新选择两次记录后再试。');
  const canvas = await nativeCall((success, fail) => {
    const query = wx.createSelectorQuery();
    const scoped = query.in ? query.in(page) : query;
    scoped.select('#comparisonShareCanvas').fields({ node: true, size: true }).exec(result => {
      const node = result && result[0] && result[0].node;
      if (node) success(node); else fail();
    });
  }, '变化卡画布暂时未准备好，请再试一次。', isCancelled);
  cancellation(isCancelled);
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境暂时无法制作变化卡，请在手机微信中重试。');
  draw(ctx, snapshot);
  cancellation(isCancelled);
  return nativeCall((success, fail) => wx.canvasToTempFilePath({
    canvas, x: 0, y: 0, width: WIDTH, height: HEIGHT, destWidth: WIDTH, destHeight: HEIGHT,
    fileType: 'jpg', quality: .9,
    success: result => result && result.tempFilePath ? success({ path: result.tempFilePath }) : fail(), fail
  }, page), '变化卡暂时未能导出，请再试一次。', isCancelled);
}

module.exports = { buildComparisonShareCard, NATIVE_TIMEOUT_MS };
