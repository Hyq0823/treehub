const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const users = db.collection('treehub_users');
const assessments = db.collection('treehub_assessments');
const MAX_BATCH_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const finiteScores = scores => plainObject(scores) && Object.keys(scores).length <= 30 &&
  Object.keys(scores).every(key => key.length <= 48 && Number.isFinite(scores[key]));
const validResult = value => typeof value === 'string' && value.length > 0 && value.length <= 100 || finiteScores(value);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function fail(message) {
  return { ok: false, message };
}

function documentId(openid, recordId) {
  return crypto.createHash('sha256').update(`${openid}:${recordId}`).digest('hex').slice(0, 32);
}

function cleanRecord(input) {
  if (!plainObject(input) || typeof input.id !== 'string' || !input.id || input.id.length > 180 ||
      typeof input.testId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.testId) ||
      !validDate(input.completedAt) || !finiteScores(input.scores) || !validResult(input.resultType) ||
      input.premiumUnlockedAt !== undefined && !validDate(input.premiumUnlockedAt)) {
    throw new Error('测评记录格式无效');
  }
  const allowed = [
    'id', 'testId', 'testVersion', 'scoringVersion', 'scores', 'resultType',
    'completedAt', 'answers', 'treeSnapshot', 'premiumUnlockedAt', 'migrated'
  ];
  const record = {};
  allowed.forEach(key => {
    if (input[key] !== undefined) record[key] = input[key];
  });
  const encoded = JSON.stringify(record);
  if (encoded.length > 300000) throw new Error('单条测评记录过大');
  if (record.answers !== undefined && (!Array.isArray(record.answers) || record.answers.length > 300)) {
    throw new Error('答题记录格式无效');
  }
  return JSON.parse(encoded);
}

async function ensureUser(openid, requestedSeed) {
  const id = documentId('user', openid);
  const found = await users.where({ owner: openid }).limit(1).get();
  if (found.data.length) return { id: found.data[0]._id, seed: found.data[0].seed };
  if (!requestedSeed || typeof requestedSeed !== 'string' || requestedSeed.length > 160) {
    throw new Error('用户树种子无效');
  }
  await users.doc(id).set({
    data: {
      owner: openid, seed: requestedSeed, schemaVersion: 1,
      createdAt: db.serverDate(), updatedAt: db.serverDate()
    }
  });
  return { id, seed: requestedSeed };
}

async function saveRecord(openid, input) {
  const record = cleanRecord(input);
  const id = documentId(openid, record.id);
  const update = { serverUpdatedAt: db.serverDate() };
  if (record.premiumUnlockedAt) update.premiumUnlockedAt = record.premiumUnlockedAt;
  const result = await assessments.doc(id).update({ data: update });
  if (result.stats && result.stats.updated > 0) return;
  await assessments.doc(id).set({
    data: Object.assign({}, record, {
      owner: openid, schemaVersion: 1,
      serverCreatedAt: db.serverDate(), serverUpdatedAt: db.serverDate()
    })
  });
}

function publicRecord(document) {
  const record = {};
  [
    'id', 'testId', 'testVersion', 'scoringVersion', 'scores', 'resultType',
    'completedAt', 'answers', 'treeSnapshot', 'premiumUnlockedAt', 'migrated'
  ].forEach(key => {
    if (document[key] !== undefined) record[key] = document[key];
  });
  return record;
}

async function syncArchive(openid, event) {
  const operation = event.operation;
  if (operation === 'push') {
    const batch = Array.isArray(event.records) ? event.records : [];
    if (batch.length > MAX_BATCH_SIZE) return fail('单次同步记录过多');
    const user = await ensureUser(openid, event.seed);
    for (const record of batch) await saveRecord(openid, record);
    await users.doc(user.id).update({ data: { updatedAt: db.serverDate() } });
    return { ok: true, accepted: batch.length, userSeed: user.seed };
  }
  if (operation === 'pull') {
    const user = await ensureUser(openid, event.seed || 'cloud-user');
    const offset = Number.isInteger(event.offset) && event.offset >= 0 ? event.offset : 0;
    const limit = Math.min(MAX_PAGE_SIZE, Number.isInteger(event.limit) && event.limit > 0 ? event.limit : MAX_PAGE_SIZE);
    const response = await assessments.where({ owner: openid })
      .orderBy('completedAt', 'desc').skip(offset).limit(limit).get();
    const records = response.data.map(publicRecord);
    return {
      ok: true, userSeed: user.seed, records,
      hasMore: records.length === limit, nextOffset: offset + records.length
    };
  }
  return fail('未知的同步操作');
}

exports.main = async (event) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return fail('无法识别当前微信用户');
    if (!event || event.clientSchemaVersion !== 1) return fail('客户端同步版本不受支持');
    if (event.action === 'syncArchive') return await syncArchive(context.OPENID, event);
    return fail('未知的云端操作');
  } catch (error) {
    console.error('treehub-api failed', error);
    return fail(error && error.message || '云端服务暂时不可用');
  }
};
