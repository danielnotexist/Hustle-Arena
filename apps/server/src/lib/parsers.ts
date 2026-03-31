export type DbRow = Record<string, unknown>;

export function asRow(value: unknown): DbRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as DbRow;
}

export function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function toBooleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function toIsoString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : new Date(0).toISOString();
}

export function isSupabaseNoRowsError(error: unknown): boolean {
  const row = asRow(error);
  return toStringValue(row.code) === 'PGRST116';
}
