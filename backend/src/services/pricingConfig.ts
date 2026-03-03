import prisma from '../lib/prisma.js';

export const PRICING_TIERS = ['starter', 'growth', 'business'] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];

export const PRICING_CURRENCIES = ['USD', 'CNY', 'JPY'] as const;
export type PricingCurrency = (typeof PRICING_CURRENCIES)[number];

export type PricingMatrix = Record<PricingCurrency, Record<PricingTier, number>>;

export interface PricingDiscountConfig {
  enabled: boolean;
  percentOff: number;
  stripeCouponId: string | null;
}

export interface PricingConfigSnapshot {
  prices: PricingMatrix;
  discount: PricingDiscountConfig;
}

export const PRICING_DISCOUNT_ENABLED_KEY = 'pricing_discount_enabled';
export const PRICING_DISCOUNT_PERCENT_KEY = 'pricing_discount_percent';
export const PRICING_DISCOUNT_COUPON_KEY = 'stripe_coupon_id_pricing_discount';

const DEFAULT_PRICES: PricingMatrix = {
  USD: { starter: 29, growth: 199, business: 399 },
  CNY: { starter: 199, growth: 1369, business: 2749 },
  JPY: { starter: 4559, growth: 31329, business: 62799 },
};

const CURRENCY_CODE_MAP: Record<string, PricingCurrency> = {
  usd: 'USD',
  cny: 'CNY',
  jpy: 'JPY',
};

function cloneDefaultPrices(): PricingMatrix {
  return {
    USD: { ...DEFAULT_PRICES.USD },
    CNY: { ...DEFAULT_PRICES.CNY },
    JPY: { ...DEFAULT_PRICES.JPY },
  };
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseBoolean(value: string): boolean {
  return value === '1' || value.toLowerCase() === 'true';
}

export function normalizeDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Number(value.toFixed(2));
}

export function isDiscountActive(discount: PricingDiscountConfig): boolean {
  return discount.enabled && discount.percentOff > 0;
}

export function getPriceConfigKey(currency: PricingCurrency, tier: PricingTier): string {
  return `price_${currency.toLowerCase()}_${tier}_monthly`;
}

export async function loadPricingConfigFromDb(): Promise<PricingConfigSnapshot> {
  const rows = await prisma.appConfig.findMany({
    where: {
      OR: [
        { key: { startsWith: 'price_' } },
        { key: { in: [PRICING_DISCOUNT_ENABLED_KEY, PRICING_DISCOUNT_PERCENT_KEY, PRICING_DISCOUNT_COUPON_KEY] } },
      ],
    },
  });

  const prices = cloneDefaultPrices();
  const discount: PricingDiscountConfig = {
    enabled: false,
    percentOff: 0,
    stripeCouponId: null,
  };

  for (const row of rows) {
    const legacyMatch = row.key.match(/^price_(starter|growth|business)_monthly$/i);
    if (legacyMatch) {
      const tier = legacyMatch[1].toLowerCase() as PricingTier;
      const value = parsePositiveNumber(row.value);
      if (value != null) prices.USD[tier] = value;
      continue;
    }

    const match = row.key.match(/^price_(usd|cny|jpy)_(starter|growth|business)_monthly$/i);
    if (match) {
      const currency = CURRENCY_CODE_MAP[match[1].toLowerCase()];
      const tier = match[2].toLowerCase() as PricingTier;
      const value = parsePositiveNumber(row.value);
      if (value != null) prices[currency][tier] = value;
      continue;
    }

    if (row.key === PRICING_DISCOUNT_ENABLED_KEY) {
      discount.enabled = parseBoolean(row.value);
      continue;
    }

    if (row.key === PRICING_DISCOUNT_PERCENT_KEY) {
      discount.percentOff = normalizeDiscountPercent(Number.parseFloat(row.value));
      continue;
    }

    if (row.key === PRICING_DISCOUNT_COUPON_KEY) {
      discount.stripeCouponId = row.value || null;
    }
  }

  if (!discount.enabled) {
    discount.percentOff = 0;
  }

  return { prices, discount };
}

export function toPublicPricingPayload(snapshot: PricingConfigSnapshot): {
  starter: number;
  growth: number;
  business: number;
  prices: PricingMatrix;
  discount: { enabled: boolean; percentOff: number };
} {
  return {
    starter: snapshot.prices.USD.starter,
    growth: snapshot.prices.USD.growth,
    business: snapshot.prices.USD.business,
    prices: snapshot.prices,
    discount: {
      enabled: isDiscountActive(snapshot.discount),
      percentOff: snapshot.discount.percentOff,
    },
  };
}
