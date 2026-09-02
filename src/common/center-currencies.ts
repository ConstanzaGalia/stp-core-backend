export const CENTER_CURRENCIES = ['ARS', 'USD', 'EUR'] as const
export type CenterCurrency = (typeof CENTER_CURRENCIES)[number]

export function isCenterCurrency(value: unknown): value is CenterCurrency {
  return value === 'ARS' || value === 'USD' || value === 'EUR'
}

export function resolveCompanyCurrencies(input?: {
  enabledCurrencies?: string[] | null
  defaultCurrency?: string | null
}): { enabledCurrencies: CenterCurrency[]; defaultCurrency: CenterCurrency } {
  const unique = [...new Set((input?.enabledCurrencies ?? []).filter(isCenterCurrency))]
  const enabledCurrencies = unique.length > 0 ? unique : (['ARS'] as CenterCurrency[])
  const defaultCurrency =
    isCenterCurrency(input?.defaultCurrency) && enabledCurrencies.includes(input.defaultCurrency)
      ? input.defaultCurrency
      : enabledCurrencies[0]
  return { enabledCurrencies, defaultCurrency }
}

export function normalizeMoneyCurrency(value: unknown, fallback: CenterCurrency = 'ARS'): CenterCurrency {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return isCenterCurrency(raw) ? raw : fallback
}
