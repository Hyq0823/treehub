const DEFAULT_SHARE_IMAGE = '/assets/share-cover.webp';

function canvasNode(page, selector) {
  return new Promise((resolve, reject) => {
    let query = wx.createSelectorQuery();
    if (query.in) query = query.in(page);
    query.select(selector).fields({ node: true, size: true }).exec(result => {
      const canvas = result && result[0] && result[0].node;
      if (canvas) resolve(canvas);
      else reject(new Error('分享画布暂时不可用'));
    });
  });
}

function loadImage(canvas, source) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function writeLines(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = '', row = 0;
  for (const character of String(text || '')) {
    const next = line + character;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = character;
      if (++row >= maxLines) return;
    } else line = next;
  }
  if (line && row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}

async function buildShareCard(page, options) {
  if (!options || !options.heroUrl) return DEFAULT_SHARE_IMAGE;
  const canvas = await canvasNode(page, options.selector || '#shareCanvas');
  canvas.width = 500; canvas.height = 400;
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, 500, 400);
  background.addColorStop(0, options.pale || '#ddecff');
  background.addColorStop(1, '#f8fbff');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 500, 400);

  ctx.fillStyle = '#ffffffb8'; ctx.fillRect(20, 22, 205, 356);
  ctx.fillStyle = '#466d9f'; ctx.font = '18px sans-serif'; ctx.fillText('人格测试树', 42, 62);
  ctx.fillStyle = '#173f77'; ctx.font = 'bold 31px sans-serif';
  writeLines(ctx, options.title || '我的人格树', 42, 122, 160, 42, 2);
  ctx.fillStyle = '#52739d'; ctx.font = '18px sans-serif';
  writeLines(ctx, options.subtitle || '收集每一种独特的你', 42, 218, 155, 30, 3);
  ctx.fillStyle = options.color || '#318aff'; ctx.fillRect(42, 330, 70, 5);
  ctx.fillStyle = '#6882a5'; ctx.font = '15px sans-serif'; ctx.fillText('来看看你的树', 42, 362);

  const image = await loadImage(canvas, options.heroUrl);
  const scale = Math.min(260 / image.width, 340 / image.height);
  const width = image.width * scale, height = image.height * scale;
  ctx.drawImage(image, 225 + (265 - width) / 2, 30 + (340 - height) / 2, width, height);

  return new Promise((resolve, reject) => wx.canvasToTempFilePath({
    canvas, x: 0, y: 0, width: 500, height: 400, destWidth: 500, destHeight: 400,
    fileType: 'jpg', quality: .82,
    success: result => resolve(result.tempFilePath || DEFAULT_SHARE_IMAGE), fail: reject
  }, page));
}

module.exports = { DEFAULT_SHARE_IMAGE, buildShareCard };
