import type { LocaleCode } from "../i18n";

const UTC_TIMESTAMP_WITHOUT_ZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/;
const TIMESTAMP_WITH_ZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

function toMilliseconds(fraction: string | undefined): number {
  if (!fraction) {
    return 0;
  }

  const normalized = `${fraction}000`.slice(0, 3);
  return Number.parseInt(normalized, 10);
}

export function parseReportDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!TIMESTAMP_WITH_ZONE_PATTERN.test(trimmed)) {
    const match = trimmed.match(UTC_TIMESTAMP_WITHOUT_ZONE_PATTERN);
    if (match) {
      const [, year, month, day, hour = "00", minute = "00", second = "00", fraction] = match;
      return new Date(
        Date.UTC(
          Number.parseInt(year, 10),
          Number.parseInt(month, 10) - 1,
          Number.parseInt(day, 10),
          Number.parseInt(hour, 10),
          Number.parseInt(minute, 10),
          Number.parseInt(second, 10),
          toMilliseconds(fraction),
        ),
      );
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatReportDateTime(value: string, locale: LocaleCode): string {
  const parsed = parseReportDateTime(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleString(locale);
}
