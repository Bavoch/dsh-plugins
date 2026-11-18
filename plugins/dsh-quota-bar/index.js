/**
 * Host half: read each model service's remaining quota straight from its own
 * API, and expose the rows to the Client.
 *
 * Each provider is queried at the endpoint its own desktop client uses, with the
 * sign-in already stored on this machine by the local gateway. A provider that
 * cannot answer — no stored sign-in, an expired token that will not renew, an
 * account without a plan — contributes no row at all, so the status line only
 * ever shows readings that are real.
 *
 * Nothing here writes credentials back: a refreshed token is used for the request
 * in flight and then dropped.
 */
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Cordis plugin name, matching the package name in the profile patch. */
const name = '@local/dsh-quota-bar';

/** The authenticated Fetch channel the route rides on. */
const inject = ['connection'];

/** Exact route on the `/api` channel. */
const ROUTE_PATH = '/api/model-quotas';

/** How long one provider query may take. */
const TIMEOUT_MS = 8_000;

/** Read a JSON file, or undefined when it is missing or unreadable. */
const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** The gateway's config directory on this machine. */
const configDir = () => {
  const base = typeof process.env.XDG_CONFIG_HOME === 'string' && process.env.XDG_CONFIG_HOME !== ''
    ? process.env.XDG_CONFIG_HOME
    : path.join(os.homedir(), '.config');
  return path.join(base, 'magpie');
};

/** Sign-ins stored on this machine, from both files the gateway keeps. */
const readLogins = async () => {
  const dir = configDir();
  const [logins, pluginAuth] = await Promise.all([
    readJson(path.join(dir, 'logins.json')),
    readJson(path.join(dir, 'plugin-auth.json')),
  ]);
  const list = Array.isArray(logins) ? logins : Object.values(logins ?? {});
  return { list, pluginAuth: pluginAuth ?? {} };
};

/** A number rounded for display. */
const formatAmount = (value) => String(Math.round(value * 100) / 100);

// ---------------------------------------------------------------------------
// WorkBuddy
// ---------------------------------------------------------------------------

/**
 * WorkBuddy's remaining credits, summed across every package it reports.
 *
 * `Packages[].CycleRemainCapacity` is what is left; the totals describe the
 * grant and are not part of the reading. An account can hold several packages
 * (the plan's own credits plus reward and top-up buckets), and the reader wants
 * the total still spendable.
 * @param auth - one stored WorkBuddy sign-in.
 * @returns the reading, or undefined when the account cannot be read.
 */
const queryWorkBuddy = async (auth) => {
  const domain = typeof auth.domain === 'string' ? auth.domain : 'www.workbuddy.cn';
  const endpoint = domain === 'www.workbuddy.ai' ? 'https://www.workbuddy.ai' : 'https://copilot.tencent.com';
  if (typeof auth.access !== 'string' || auth.access === '') return undefined;

  const ask = (bearer) => fetch(`${endpoint}/billing/meter/get-user-resource-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'WorkBuddy/5.6.0',
      Authorization: `Bearer ${bearer}`,
      'X-User-Id': typeof auth.uid === 'string' ? auth.uid : '',
      'X-Domain': domain,
      'X-Product': 'SaaS',
      'X-IDE-Type': 'WorkBuddy',
    },
    body: '{}',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let bearer = auth.access;
  let response = await ask(bearer);
  if (response.status === 401) {
    // A refused token is renewed once, for this request only.
    const renewed = await renewWorkBuddy(auth, endpoint, domain);
    if (renewed === undefined) return undefined;
    bearer = renewed;
    response = await ask(bearer);
  }
  if (!response.ok) return undefined;

  const payload = await response.json();
  const data = payload?.data;
  if (data === undefined || data === null) return undefined;

  const packages = Array.isArray(data.Packages) ? data.Packages : [];
  if (packages.length === 0) return undefined;

  const remaining = packages.reduce((sum, pkg) => {
    const value = Number(pkg?.CycleRemainCapacity);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  // Fetch package details to discover reset and expiration times.
  let resetAt;
  let clearAt;
  let clearAmount;
  try {
    const codes = packages.map((pkg) => pkg?.PackageCode).filter(Boolean);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'WorkBuddy/5.6.0',
      Authorization: `Bearer ${bearer}`,
      'X-User-Id': typeof auth.uid === 'string' ? auth.uid : '',
      'X-Domain': domain,
      'X-Product': 'SaaS',
      'X-IDE-Type': 'WorkBuddy',
    };
    const pad = (v) => String(v).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [freeRes, paidRes] = await Promise.all([
      fetch(`${endpoint}/billing/meter/get-user-resource-free-packages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          PageNumber: 1,
          PageSize: 100,
          PackageCodes: codes,
          Status: [0, 3],
          SlicePeriodStartTime: fmt(start),
          SlicePeriodEndTime: fmt(end),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${endpoint}/billing/meter/get-user-resource-paid-packages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          PageNumber: 1,
          PageSize: 100,
          PackageCodes: codes,
          Status: [0, 3],
          NeedRenewInfo: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    const accounts = [
      ...(Array.isArray(freeRes?.data?.Accounts) ? freeRes.data.Accounts : []),
      ...(Array.isArray(paidRes?.data?.Accounts) ? paidRes.data.Accounts : []),
    ];

    const basePlanAcc = accounts.find((a) =>
      a.PackageName?.includes('体验版')
      || a.PackageName?.includes('Free Plan')
      || a.PackageName?.includes('Subscription')
      || a.CapacityType === 4,
    );

    if (basePlanAcc?.CycleEndTime) {
      const d = new Date(basePlanAcc.CycleEndTime);
      if (!Number.isNaN(d.getTime())) resetAt = d.toISOString();
    }

    const nowMs = Date.now();
    const expiringPacks = accounts.filter((a) => {
      if (a === basePlanAcc) return false;
      const remain = Number(a.CycleCapacityRemainPrecise ?? a.CycleCapacityRemain) || 0;
      if (remain <= 0) return false;
      const endTime = new Date(a.CycleEndTime).getTime();
      return Number.isFinite(endTime) && endTime > nowMs;
    }).sort((a, b) => new Date(a.CycleEndTime) - new Date(b.CycleEndTime));

    if (expiringPacks.length > 0) {
      const earliestTime = expiringPacks[0].CycleEndTime;
      const sameTimePacks = expiringPacks.filter((a) => a.CycleEndTime === earliestTime);
      const sumRemain = sameTimePacks.reduce((sum, a) => {
        const val = Number(a.CycleCapacityRemainPrecise ?? a.CycleCapacityRemain) || 0;
        return sum + val;
      }, 0);
      const d = new Date(earliestTime);
      if (!Number.isNaN(d.getTime())) {
        clearAt = d.toISOString();
        clearAmount = formatAmount(sumRemain);
      }
    }
  } catch {
    // Detail failure does not prevent quota reporting.
  }

  const international = domain === 'www.workbuddy.ai';
  return {
    id: `workbuddy/${auth.uid ?? auth.accountId ?? domain}`,
    provider: international ? 'workbuddy-ai' : 'workbuddy',
    name: international ? 'WorkBuddy AI' : 'WorkBuddy',
    account: typeof auth.accountId === 'string' && auth.accountId !== '' ? auth.accountId : undefined,
    credited: true,
    amount: formatAmount(remaining),
    resetAt,
    clearAt,
    clearAmount,
    detail: packages.map((pkg) => ({
      name: typeof pkg?.PackageName === 'string' && pkg.PackageName !== '' ? pkg.PackageName : 'Credits',
      amount: formatAmount(Number(pkg?.CycleRemainCapacity) || 0),
    })),
  };
};

/** Renew a WorkBuddy sign-in for one request. */
const renewWorkBuddy = async (auth, endpoint, domain) => {
  if (typeof auth.refresh !== 'string' || auth.refresh === '') return undefined;
  try {
    const response = await fetch(`${endpoint}/v2/plugin/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Domain': domain, 'X-Product': 'SaaS' },
      body: JSON.stringify({ refresh_token: auth.refresh }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const payload = await response.json();
    const token = payload?.data?.access ?? payload?.access;
    return typeof token === 'string' && token !== '' ? token : undefined;
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

/** Codex's rolling rate-limit window, as a share remaining. */
const queryCodex = async (auth) => {
  const tokens = auth?.tokens;
  const access = typeof tokens?.access_token === 'string' ? tokens.access_token : undefined;
  if (access === undefined) return undefined;
  const accountId = typeof tokens.account_id === 'string' ? tokens.account_id : undefined;

  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    headers: {
      Authorization: `Bearer ${access}`,
      ...accountId === undefined ? {} : { 'chatgpt-account-id': accountId },
      'User-Agent': 'codex-cli/0.68.0',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return undefined;

  const payload = await response.json();
  const window = payload?.rate_limit?.primary_window;
  const used = Number(window?.used_percent);
  if (!Number.isFinite(used)) return undefined;

  const resetAt = Number(window?.reset_at);
  return {
    id: 'codex',
    provider: 'codex',
    name: 'Codex',
    account: typeof payload?.email === 'string' ? payload.email : undefined,
    plan: typeof payload?.plan_type === 'string' ? payload.plan_type : undefined,
    credited: false,
    remaining: Math.max(0, Math.min(100, Math.round(100 - used))),
    resetAt: Number.isFinite(resetAt) ? new Date(resetAt * 1000).toISOString() : undefined,
    detail: [],
  };
};

// ---------------------------------------------------------------------------
// Antigravity (Google Cloud Code)
// ---------------------------------------------------------------------------

// Read the OAuth client configuration from the DSH host environment.
const ANTIGRAVITY_CLIENT_ID = process.env.DSH_ANTIGRAVITY_CLIENT_ID?.trim();
const ANTIGRAVITY_CLIENT_SECRET = process.env.DSH_ANTIGRAVITY_CLIENT_SECRET?.trim();

/** The base URL for Antigravity's Cloud Code quota endpoints. */
const ANTIGRAVITY_BASE = 'https://cloudcode-pa.googleapis.com/v1internal';

/**
 * Classify a model id (or a group's display text) into the pool it belongs to.
 *
 * Antigravity bills two separate allowances: one shared by the Claude and GPT
 * models, and one for the Gemini models. The pool is the reading's identity, so
 * a Gemini window and a Claude window must never be collapsed into one number.
 * @param text - a model id or a group display name.
 * @returns the pool id and its human label.
 */
const antigravityPool = (text) => {
  const value = String(text ?? '').toLowerCase();
  if (value.includes('gemini')) return { id: 'gemini', label: 'Gemini' };
  return { id: 'claude', label: 'Claude & GPT' };
};

/**
 * Turn a quota bucket's window into a short stable key and its display order.
 *
 * The summary reports `window: '5h' | 'weekly'`; a bucket may carry only a
 * display name. Both collapse to the two keys the bar shows: `5h` (the rolling
 * five-hour window) and `7d` (the seven-day window).
 * @param bucket - one summary bucket.
 * @returns the key (`5h` | `7d`) and its sort weight.
 */
const antigravityWindowKey = (bucket) => {
  const window = String(bucket?.window ?? '').toLowerCase();
  const name = String(bucket?.displayName ?? '').toLowerCase();
  const weekly = window.includes('week') || window.includes('7') || name.includes('week') || name.includes('7');
  return weekly
    ? { key: '7d', order: 1 }
    : { key: '5h', order: 0 };
};

/** Percent remaining from a bucket's `remainingFraction`, clamped and rounded. */
const antigravityPercent = (fraction) => {
  const value = Number(fraction);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
};

/**
 * Antigravity's per-pool allowance, split by model family and window.
 *
 * Two endpoints together describe an account:
 *  - `retrieveUserQuotaSummary` reports one entry per *pool* (Gemini; Claude &
 *    GPT), each with a five-hour and a seven-day bucket. This is the exact
 *    reading the desktop app shows, so it is authoritative when present.
 *  - `retrieveUserQuota` reports one bucket per *model*. It is used to discover
 *    a pool the summary omits (an account can hold Gemini quota without the
 *    summary naming it) and to read that pool's per-model remaining share.
 *
 * A pool becomes one row carrying both of its windows, so the bar can show
 * "Gemini · 5h 92% · 7d 88%" separately from the Claude/GPT allowance.
 * @param auth - the stored Google sign-in.
 * @returns the per-pool rows, or an empty array when the account cannot be read.
 */
const queryAntigravity = async (auth) => {
  const refresh = typeof auth?.refresh_token === 'string' ? auth.refresh_token : undefined;
  if (refresh === undefined) return [];

  const token = await renewGoogle(refresh);
  if (token === undefined) return [];

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'antigravity/1.0',
  };
  const body = JSON.stringify(typeof auth.project === 'string' ? { project: auth.project } : {});
  const ask = (method) => fetch(`${ANTIGRAVITY_BASE}:${method}`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const [summaryRes, perModelRes] = await Promise.all([
    ask('retrieveUserQuotaSummary').catch(() => undefined),
    ask('retrieveUserQuota').catch(() => undefined),
  ]);

  const summary = summaryRes?.ok ? await summaryRes.json().catch(() => undefined) : undefined;
  const perModel = perModelRes?.ok ? await perModelRes.json().catch(() => undefined) : undefined;

  /** @type {Map<string, { pool: {id:string,label:string}, windows: Map<string,{key:string,order:number,remaining:number,resetAt?:string}> }>} */
  const pools = new Map();
  const ensurePool = (pool) => {
    let entry = pools.get(pool.id);
    if (entry === undefined) {
      entry = { pool, windows: new Map() };
      pools.set(pool.id, entry);
    }
    return entry;
  };

  // 1. Authoritative per-pool windows, from the summary groups.
  const groups = Array.isArray(summary?.groups) ? summary.groups : [];
  for (const group of groups) {
    const buckets = Array.isArray(group?.buckets) ? group.buckets : [];
    const representative = buckets[0]?.displayName ?? group?.displayName ?? '';
    // Prefer the group's own display name (it names the family); fall back to a
    // bucket label when a group is unnamed.
    const pool = antigravityPool(group?.displayName ?? group?.description ?? representative);
    const entry = ensurePool(pool);
    for (const bucket of buckets) {
      const remaining = antigravityPercent(bucket?.remainingFraction);
      if (remaining === undefined) continue;
      const { key, order } = antigravityWindowKey(bucket);
      const resetAt = typeof bucket?.resetTime === 'string' ? bucket.resetTime : undefined;
      const previous = entry.windows.get(key);
      // Keep the tightest reading for a window if a pool reports it twice.
      if (previous === undefined || remaining < previous.remaining) {
        entry.windows.set(key, { key, order, remaining, resetAt });
      }
    }
  }

  // 2. Discover pools the summary did not name, and read them from per-model
  //    buckets. A per-model bucket reports the rolling window's share only.
  const perModelBuckets = Array.isArray(perModel?.buckets) ? perModel.buckets : [];
  for (const bucket of perModelBuckets) {
    const modelId = bucket?.modelId;
    if (typeof modelId !== 'string' || modelId === '') continue;
    const remaining = antigravityPercent(bucket?.remainingFraction);
    if (remaining === undefined) continue;
    const pool = antigravityPool(modelId);
    const entry = ensurePool(pool);
    if (entry.windows.has('5h')) continue; // Summary already speaks for this pool.
    const resetAt = typeof bucket?.resetTime === 'string' ? bucket.resetTime : undefined;
    const previous = entry.windows.get('5h');
    if (previous === undefined || remaining < previous.remaining) {
      entry.windows.set('5h', { key: '5h', order: 0, remaining, resetAt });
    }
  }

  const rows = [];
  for (const { pool, windows } of pools.values()) {
    const ordered = [...windows.values()].sort((a, b) => a.order - b.order);
    if (ordered.length === 0) continue;
    // The row's own reading is its tightest window, matching the earlier intent:
    // the window that runs out first is what the reader most needs to see.
    const tightest = ordered.reduce((worst, w) => (w.remaining < worst.remaining ? w : worst), ordered[0]);
    rows.push({
      id: `antigravity/${pool.id}`,
      provider: 'antigravity',
      name: `Antigravity · ${pool.label}`,
      credited: false,
      remaining: tightest.remaining,
      resetAt: tightest.resetAt,
      windows: ordered.map((w) => ({
        key: w.key,
        remaining: w.remaining,
        resetAt: w.resetAt,
      })),
      detail: [],
    });
  }
  return rows;
};

/** Exchange a Google refresh token for an access token. */
const renewGoogle = async (refresh) => {
  if (!ANTIGRAVITY_CLIENT_ID || !ANTIGRAVITY_CLIENT_SECRET) return undefined;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const payload = await response.json();
    return typeof payload?.access_token === 'string' ? payload.access_token : undefined;
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/** Run one query, turning any failure into "no reading". */
const settle = async (query) => {
  try {
    return await query();
  } catch {
    return undefined;
  }
};

/**
 * Collect every readable provider.
 * @returns the rows, in a stable display order.
 */
const collect = async () => {
  const { list, pluginAuth } = await readLogins();

  const workBuddyAuths = Object.entries(pluginAuth)
    .filter(([key, value]) => key.startsWith('workbuddy') && value?.type === 'oauth')
    .map(([key, value]) => value);

  const codex = list.find((entry) => entry?.agent === 'codex')?.auth;
  const antigravity = list.find((entry) => entry?.agent === 'antigravity')?.auth;

  const results = await Promise.all([
    ...workBuddyAuths.map((auth) => settle(() => queryWorkBuddy(auth))),
    settle(() => queryCodex(codex)),
    // Antigravity answers with one row per model pool (Gemini; Claude & GPT).
    settle(() => queryAntigravity(antigravity)),
  ]);

  return results
    .flat()
    .filter((row) => row !== undefined && row !== null);
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/**
 * Plugin entry: register the quota route.
 * @param ctx - Host context carrying the authenticated Fetch channel.
 */
function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        return json({ rows: await collect() });
      } catch (error) {
        ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)));
        return json({ rows: [] });
      }
    },
  }), 'quota-bar: model quota route');
}

export { apply, inject, name };
