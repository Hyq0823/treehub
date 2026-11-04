const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const MAX_BATCH_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const POLICY_VERSION = '2026-10-30';
const THEME_IDS = ['adventurer', 'moon', 'romantic', 'dreamer', 'wanderer', 'listener', 'collector', 'observer', 'aurora'];
const TEST_IDS = ['sbti', 'mbti', 'enneagram', 'bigfive', 'shadow', 'ie'];
const SUMMARY_FIELDS = ['id', 'testId', 'testVersion', 'scoringVersion', 'scores', 'resultType', 'completedAt', 'premiumUnlockedAt', 'migrated'];
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validDate = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const finiteScores = scores => plainObject(scores) && Object.keys(scores).length <= 30 && Object.keys(scores).every(key =>
  /^[a-zA-Z0-9_-]{1,48}$/.test(key) && Number.isFinite(scores[key]) && Math.abs(scores[key]) <= 1000000000);
const validResult = value => typeof value === 'string' && value.length > 0 && value.length <= 100 || finiteScores(value) && Object.keys(value).length > 0;
const fail = message => ({ ok: false, message });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const documentId = (openid, recordId) => hash(`${openid}:${recordId}`).slice(0, 32);
const userId = openid => documentId('user', openid);
const consentHash = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,160}$/.test(value) ? hash(value) : '';

function summaryRecord(document) {
  const record = {};
  SUMMARY_FIELDS.forEach(key => { if (document[key] !== undefined) record[key] = document[key]; });
  return record;
}

function cleanRecord(input) {
  if (!plainObject(input) || typeof input.id !== 'string' || !input.id || input.id.length > 180 ||
      typeof input.testId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.testId) ||
      !validDate(input.completedAt) || !finiteScores(input.scores) || !validResult(input.resultType) ||
      input.premiumUnlockedAt !== undefined && !validDate(input.premiumUnlockedAt) ||
      input.testVersion !== undefined && (typeof input.testVersion !== 'string' || input.testVersion.length > 32) ||
      input.scoringVersion !== undefined && (typeof input.scoringVersion !== 'string' || input.scoringVersion.length > 32) ||
      input.migrated !== undefined && typeof input.migrated !== 'boolean') {
    throw new Error('测评结果摘要格式无效');
  }
  // Raw answers, historic images, tree snapshots, free text and unexpected fields
  // are deliberately excluded, including when a legacy client sends them.
  const record = summaryRecord(input);
  const encoded = JSON.stringify(record);
  if (encoded.length > 20000) throw new Error('单条结果摘要过大');
  return JSON.parse(encoded);
}

function cleanThemeState(input) {
  if (!plainObject(input) || input.version !== 1 || !THEME_IDS.includes(input.selectedId) ||
      typeof input.starterClaimed !== 'boolean' || !Array.isArray(input.unlocked) || input.unlocked.length > THEME_IDS.length) {
    throw new Error('主题收藏格式无效');
  }
  const seen = new Set();
  const unlocked = input.unlocked.map(grant => {
    if (!plainObject(grant) || !THEME_IDS.includes(grant.themeId) || seen.has(grant.themeId) || !validDate(grant.unlockedAt) ||
        !['starter', 'rewarded-video'].includes(grant.source) || grant.source === 'starter' && !['adventurer', 'romantic'].includes(grant.themeId)) {
      throw new Error('主题解锁记录格式无效');
    }
    seen.add(grant.themeId);
    return { themeId: grant.themeId, unlockedAt: grant.unlockedAt, source: grant.source };
  });
  // Two devices may have independently chosen the two legitimate starter themes
  // before their first backup. Preserve both rather than blocking result recovery.
  if (unlocked.filter(grant => grant.source === 'starter').length > 2) throw new Error('基础主题记录无效');
  return { version: 1, selectedId: input.selectedId, starterClaimed: input.starterClaimed, unlocked };
}

function mergeThemeState(existing, incoming, explorationCount) {
  const previous = existing || { version: 1, selectedId: 'adventurer', starterClaimed: false, unlocked: [] };
  const grants = new Map(previous.unlocked.map(grant => [grant.themeId, grant]));
  incoming.unlocked.forEach(grant => {
    if (!grants.has(grant.themeId)) {
      if (grant.themeId === 'aurora' && explorationCount < 5) throw new Error('隐藏主题需要完成五类不同测试后解锁');
      if (grant.source === 'starter' && explorationCount < 1) {
        throw new Error('基础主题领取条件不满足');
      }
      grants.set(grant.themeId, grant);
    } else if (Date.parse(grant.unlockedAt) < Date.parse(grants.get(grant.themeId).unlockedAt)) {
      // Preserve the canonical acquisition source even when restoring an earlier timestamp.
      grants.set(grant.themeId, Object.assign({}, grants.get(grant.themeId), { unlockedAt: grant.unlockedAt }));
    }
  });
  const unlocked = Array.from(grants.values());
  return {
    version: 1,
    selectedId: grants.has(incoming.selectedId) ? incoming.selectedId : grants.has(previous.selectedId) ? previous.selectedId : unlocked[0] && unlocked[0].themeId || 'adventurer',
    starterClaimed: previous.starterClaimed || incoming.starterClaimed || unlocked.some(grant => grant.source === 'starter'),
    unlocked
  };
}

async function countExplorations(openid, incoming) {
  const ids = new Set(incoming.filter(record => TEST_IDS.includes(record.testId) && record.scoringVersion === '2' && !record.migrated).map(record => record.testId));
  let offset = 0;
  while (ids.size < 5) {
    const page = await db.collection('treehub_assessments').where({ owner: openid })
      .orderBy('completedAt', 'desc').skip(offset).limit(MAX_PAGE_SIZE).get();
    page.data.forEach(record => {
      if (TEST_IDS.includes(record.testId) && record.scoringVersion === '2' && !record.migrated) ids.add(record.testId);
    });
    if (page.data.length < MAX_PAGE_SIZE) break;
    offset += page.data.length;
    if (offset > 100000) throw new Error('档案数量较多，请联系运营者协助恢复主题');
  }
  return ids.size;
}

async function getDocument(ref) {
  try {
    const result = await ref.get();
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
  } catch (error) {
    if (/not exist|not found|不存在/i.test(error && (error.errMsg || error.message) || '')) return null;
    throw error;
  }
}

async function authorizeBackup(openid, event) {
  const consent = event.consent;
  const token = consent && consentHash(consent.id);
  if (!token || consent.policyVersion !== POLICY_VERSION || !validDate(consent.acceptedAt) || Date.parse(consent.acceptedAt) > Date.now() + 60000 ||
      typeof event.seed !== 'string' || !event.seed || event.seed.length > 160) {
    return fail('请先阅读隐私政策，并单独选择开启云备份');
  }
  await db.runTransaction(async transaction => {
    const ref = transaction.collection('treehub_users').doc(userId(openid));
    const existing = await getDocument(ref) || {};
    if (existing.deleting) throw new Error('云端数据正在删除，请完成删除后再开启备份');
    if (existing.consentNotBefore && Date.parse(consent.acceptedAt) <= existing.consentNotBefore) {
      throw new Error('这次授权早于云端删除，请重新阅读并选择开启云备份');
    }
    const revoked = existing.revokedConsentHashes || [];
    if (revoked.includes(token)) throw new Error('这次云备份授权已撤回，请在隐私设置中重新开启');
    const tokens = existing.consentHashes || [];
    if (!tokens.includes(token)) tokens.push(token);
    if (tokens.length > 100) throw new Error('备份设备授权过多，请删除云端数据后重新开启备份');
    const nextUser = {
      owner: openid, seed: existing.seed || event.seed, schemaVersion: 2,
      consentHashes: tokens, revokedConsentHashes: revoked,
      policyVersion: POLICY_VERSION, consentAcceptedAt: consent.acceptedAt,
      createdAt: existing.createdAt || db.serverDate(), updatedAt: db.serverDate(),
      mutation: (existing.mutation || 0) + 1
    };
    if (existing.consentNotBefore) nextUser.consentNotBefore = existing.consentNotBefore;
    if (existing.themeState) nextUser.themeState = existing.themeState;
    await ref.set({ data: nextUser });
  });
  return { ok: true };
}

function assertAuthorized(user, token) {
  if (!token || !user || user.deleting || !user.seed || !(user.consentHashes || []).includes(token)) {
    throw new Error('云备份授权已关闭，请在隐私设置中重新选择');
  }
}

async function syncArchive(openid, event) {
  const token = consentHash(event.consentId);
  if (event.operation === 'push') {
    if (!Array.isArray(event.records) || event.records.length > MAX_BATCH_SIZE) return fail('单次同步记录格式无效');
    const batch = event.records.map(cleanRecord);
    const themeState = event.themeState === undefined ? null : cleanThemeState(event.themeState);
    const explorationCount = themeState ? await countExplorations(openid, batch) : 0;
    const result = await db.runTransaction(async transaction => {
      const userRef = transaction.collection('treehub_users').doc(userId(openid));
      const user = await getDocument(userRef);
      assertAuthorized(user, token);
      const writes = [];
      for (const record of batch) {
        const ref = transaction.collection('treehub_assessments').doc(documentId(openid, record.id));
        const existing = await getDocument(ref);
        writes.push({ ref, existing, record });
      }
      // Touch the same user document as deletion. Concurrent pushes/deletions are
      // serialized by the transaction; a retried revoked push cannot resurrect data.
      const userUpdate = { updatedAt: db.serverDate(), mutation: (user.mutation || 0) + 1 };
      if (themeState) userUpdate.themeState = mergeThemeState(user.themeState, themeState, explorationCount);
      await userRef.update({ data: userUpdate });
      for (const { ref, existing, record } of writes) {
        const canonical = existing ? summaryRecord(existing) : record;
        if (record.premiumUnlockedAt && (!canonical.premiumUnlockedAt || Date.parse(record.premiumUnlockedAt) < Date.parse(canonical.premiumUnlockedAt))) {
          canonical.premiumUnlockedAt = record.premiumUnlockedAt;
        }
        await ref.set({ data: Object.assign({}, canonical, {
          owner: openid, schemaVersion: 2,
          serverCreatedAt: existing && existing.serverCreatedAt || db.serverDate(), serverUpdatedAt: db.serverDate()
        }) });
      }
      return { ok: true, accepted: batch.length, userSeed: user.seed };
    });
    return result;
  }
  if (event.operation === 'pull') {
    const user = await getDocument(db.collection('treehub_users').doc(userId(openid)));
    assertAuthorized(user, token);
    const page = await readMyRecords(openid, event, user.seed, token);
    if (user.themeState) page.themeState = user.themeState;
    return page;
  }
  return fail('未知的同步操作');
}

async function sanitizeLegacyRecords(openid, token, documents) {
  const allowed = new Set([...SUMMARY_FIELDS, '_id', 'owner', 'schemaVersion', 'serverCreatedAt', 'serverUpdatedAt']);
  const legacy = documents.filter(document => document.schemaVersion !== 2 || Object.keys(document).some(key => !allowed.has(key)));
  for (let offset = 0; offset < legacy.length; offset += MAX_BATCH_SIZE) {
    const chunk = legacy.slice(offset, offset + MAX_BATCH_SIZE);
    await db.runTransaction(async transaction => {
      const userRef = transaction.collection('treehub_users').doc(userId(openid));
      const user = await getDocument(userRef);
      assertAuthorized(user, token);
      const writes = [];
      for (const document of chunk) {
        const ref = transaction.collection('treehub_assessments').doc(document._id);
        const current = await getDocument(ref);
        if (current && current.owner === openid) writes.push({ ref, current });
      }
      // Share deletion's transaction lock. A cleanup of an old read page must not
      // recreate a record after that account has revoked/deleted its backup.
      await userRef.update({ data: { mutation: (user.mutation || 0) + 1, updatedAt: db.serverDate() } });
      for (const { ref, current } of writes) {
        await ref.set({ data: Object.assign({}, summaryRecord(current), {
          owner: openid, schemaVersion: 2,
          serverCreatedAt: current.serverCreatedAt || db.serverDate(), serverUpdatedAt: db.serverDate()
        }) });
      }
    });
  }
  return legacy.length;
}

async function readMyRecords(openid, event, seed, consentToken) {
  const offset = Number.isInteger(event.offset) && event.offset >= 0 && event.offset <= 100000 ? event.offset : 0;
  const limit = Math.min(MAX_PAGE_SIZE, Number.isInteger(event.limit) && event.limit > 0 ? event.limit : MAX_PAGE_SIZE);
  const response = await db.collection('treehub_assessments').where({ owner: openid })
    .orderBy('completedAt', 'desc').skip(offset).limit(limit).get();
  const sanitizedLegacyRecords = consentToken ? await sanitizeLegacyRecords(openid, consentToken, response.data) : 0;
  const records = response.data.map(summaryRecord);
  return { ok: true, userSeed: seed || '', records, hasMore: records.length === limit, nextOffset: offset + records.length, sanitizedLegacyRecords };
}

async function exportMyData(openid, event) {
  const user = await getDocument(db.collection('treehub_users').doc(userId(openid)));
  const page = await readMyRecords(openid, event, user && user.seed);
  if (user && user.themeState) page.themeState = user.themeState;
  return page;
}

async function deleteMyData(openid) {
  const ref = db.collection('treehub_users').doc(userId(openid));
  await db.runTransaction(async transaction => {
    const transactionRef = transaction.collection('treehub_users').doc(userId(openid));
    const user = await getDocument(transactionRef) || {};
    const revoked = Array.from(new Set([...(user.revokedConsentHashes || []), ...(user.consentHashes || [])]));
    // No answers, scores, seed or plaintext OpenID remain in this small revocation
    // tombstone. It only prevents previously authorized devices replaying old writes.
    await transactionRef.set({ data: {
      schemaVersion: 2, deleting: true, revokedConsentHashes: revoked,
      mutation: (user.mutation || 0) + 1, deletedAt: db.serverDate(), consentNotBefore: Date.now()
    } });
  });
  let removed = 0;
  while (true) {
    const batch = await db.collection('treehub_assessments').where({ owner: openid }).limit(MAX_PAGE_SIZE).get();
    if (!batch.data.length) break;
    for (const document of batch.data) {
      await db.collection('treehub_assessments').doc(document._id).remove();
      removed++;
    }
  }
  await ref.update({ data: { deleting: false, deletedAt: db.serverDate() } });
  return { ok: true, removed };
}

// Public asset/theme handlers can be registered here without weakening the
// owner-scoped assessment handlers or invoking backup authorization implicitly.
const extensionHandlers = {};

exports.main = async event => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) return fail('无法识别当前微信用户');
    if (!event || event.clientSchemaVersion !== 1) return fail('客户端同步版本不受支持');
    if (event.action === 'authorizeBackup') return await authorizeBackup(context.OPENID, event);
    if (event.action === 'syncArchive') return await syncArchive(context.OPENID, event);
    if (event.action === 'exportMyData') return await exportMyData(context.OPENID, event);
    if (event.action === 'deleteMyData') return await deleteMyData(context.OPENID);
    if (extensionHandlers[event.action]) return await extensionHandlers[event.action](context.OPENID, event);
    return fail('未知的云端操作');
  } catch (error) {
    // Avoid logging submitted records, answers or identifiers in provider logs.
    console.error('treehub-api request failed', error && error.code || 'REQUEST_FAILED');
    return fail(error && error.message || '云端服务暂时不可用');
  }
};
