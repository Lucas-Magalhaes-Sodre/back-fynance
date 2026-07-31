export const PLAN_PRODUCTS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'financial-control', label: 'Controle financeiro' },
  { key: 'cards', label: 'Cartões' },
  { key: 'savings', label: 'Economias' },
  { key: 'goals', label: 'Metas' },
  { key: 'birthdays', label: 'Aniversários' },
  { key: 'vacation-calculator', label: 'Calculadora de Férias' },
  { key: 'settings', label: 'Configurações' }
] as const;

export const PLAN_PRODUCT_KEYS = PLAN_PRODUCTS.map((product) => product.key);
export type PlanProductKey = (typeof PLAN_PRODUCT_KEYS)[number];

export function normalizePlanProductKeys(input?: string[] | null) {
  const allowed = new Set<string>(PLAN_PRODUCT_KEYS);
  const source = input ?? PLAN_PRODUCT_KEYS;
  return Array.from(new Set(source.filter((key) => allowed.has(key))));
}

export function normalizePlanProductLabels(input?: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const allowed = new Set<string>(PLAN_PRODUCT_KEYS);
  return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!allowed.has(key) || typeof value !== 'string') return acc;
    const label = value.trim().slice(0, 60);
    if (label) acc[key] = label;
    return acc;
  }, {});
}

export function normalizePlanIncludedItems(input?: string[] | null) {
  return Array.from(new Set(
    (input ?? [])
      .map((item) => item.trim().replace(/\s+/g, ' ').slice(0, 100))
      .filter(Boolean)
  )).slice(0, 30);
}

export function hasPlanProductAccess(input: {
  productKey: string;
  productKeys?: string[] | null;
}) {
  const normalized = normalizePlanProductKeys(input.productKeys);
  return normalized.includes(input.productKey);
}
