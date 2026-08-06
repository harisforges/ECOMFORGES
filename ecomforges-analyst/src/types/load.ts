/**
 * Fixture / intake JSON → Engagement.
 *
 * A bare number in the JSON becomes DATA. A `null` becomes ASK carrying the field name,
 * so a field the client explicitly could not supply reads differently in the brief from
 * one nobody asked about.
 */

import { ask, data, type Tagged } from './tagged.js';
import {
  PLATFORM_NAMES,
  type Engagement,
  type Fulfilment,
  type PlatformData,
  type PlatformName,
  type TopSku,
  type Trend,
} from './datasheet.js';

type Raw = Record<string, unknown>;

function tag<T>(v: unknown, platform: string, field: string): Tagged<T> | undefined {
  if (v === undefined) return undefined;
  if (v === null) return ask(`${platform}: ${field} not supplied`);
  return data(v as T);
}

const TRENDS: readonly string[] = ['up', 'flat', 'down'];
const FULFILMENTS: readonly string[] = ['clean', 'minor-delays', 'sla-breaches', 'out-of-stock'];

function platform(raw: Raw): PlatformData {
  const name = raw['platform'];
  if (typeof name !== 'string' || !PLATFORM_NAMES.includes(name as PlatformName)) {
    throw new Error(
      `unknown platform ${JSON.stringify(name)} — expected one of ${PLATFORM_NAMES.join(', ')}`,
    );
  }
  const p = name as PlatformName;

  const numeric = [
    'sessions',
    'buyers',
    'orders',
    'headlineCvr',
    'aov',
    'gmv',
    'organicSharePct',
    'sessionTrendPct',
    'promoRevenuePct',
    'adSpend',
    'roas',
    'grossMarginPct',
    'cancelledOrders',
    'cancelledValue',
    'refundedOrders',
    'refundedValue',
    'addToCartUsers',
    'wishlistUsers',
  ] as const;

  const out: Record<string, unknown> = { platform: p };
  for (const key of numeric) {
    const t = tag<number>(raw[key], p, key);
    if (t !== undefined) out[key] = t;
  }

  if (typeof raw['headlineCvrBasis'] === 'string') out['headlineCvrBasis'] = raw['headlineCvrBasis'];

  const aovTrend = raw['aovTrend'];
  if (aovTrend !== undefined) {
    if (aovTrend === null) out['aovTrend'] = ask(`${p}: AOV trend not supplied`);
    else if (typeof aovTrend === 'string' && TRENDS.includes(aovTrend)) {
      out['aovTrend'] = data(aovTrend as Trend);
    } else throw new Error(`${p}: aovTrend must be up, flat, or down`);
  }

  const f = raw['fulfilment'];
  if (f !== undefined) {
    if (f === null) out['fulfilment'] = ask(`${p}: fulfilment state not supplied`);
    else if (typeof f === 'string' && FULFILMENTS.includes(f)) {
      out['fulfilment'] = data(f as Fulfilment);
    } else throw new Error(`${p}: fulfilment must be one of ${FULFILMENTS.join(', ')}`);
  }

  const skus = raw['topSkus'];
  if (Array.isArray(skus)) {
    out['topSkus'] = skus.map((s): TopSku => {
      const o = s as Raw;
      return {
        name: String(o['name'] ?? ''),
        units: Number(o['units'] ?? 0),
        revenue: Number(o['revenue'] ?? 0),
      };
    });
  }

  return out as unknown as PlatformData;
}

export function loadEngagement(json: string): Engagement {
  const raw = JSON.parse(json) as Raw;
  const platforms = raw['platforms'];
  if (!Array.isArray(platforms)) throw new Error('engagement JSON needs a platforms array');

  const rayaRaw = raw['rayaDates'];
  const rayaDates = Array.isArray(rayaRaw) ? rayaRaw.map((d) => new Date(String(d))) : undefined;
  const supplied = raw['suppliedBenchmarkCvr'];

  return {
    clientCode: String(raw['clientCode'] ?? ''),
    periodStart: new Date(String(raw['periodStart'])),
    periodEnd: new Date(String(raw['periodEnd'])),
    category: String(raw['category'] ?? ''),
    platforms: platforms.map((p) => platform(p as Raw)),
    ...(rayaDates !== undefined ? { rayaDates } : {}),
    ...(typeof supplied === 'number' ? { suppliedBenchmarkCvr: supplied } : {}),
  };
}
