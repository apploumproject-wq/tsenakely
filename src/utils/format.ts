import type {StatsPeriod} from '../db/types';

export function formatAriary(amount: number, currency = 'Ar'): string {
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  })
    .format(rounded)
    .replace(/\u202f|\u00a0/g, ' ');
  return `${formatted} ${currency}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  })
    .format(Math.round(value))
    .replace(/\u202f|\u00a0/g, ' ');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPeriodBounds(
  period: StatsPeriod,
  customStart?: string,
  customEnd?: string
): {startIso: string; endIso: string; label: string} {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'today': {
      return {
        startIso: startOfDay(now).toISOString(),
        endIso: endOfDay(now).toISOString(),
        label: "Aujourd'hui",
      };
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return {
        startIso: startOfDay(y).toISOString(),
        endIso: endOfDay(y).toISOString(),
        label: 'Hier',
      };
    }
    case 'week': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return {
        startIso: startOfDay(monday).toISOString(),
        endIso: endOfDay(now).toISOString(),
        label: 'Cette semaine',
      };
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startIso: startOfDay(first).toISOString(),
        endIso: endOfDay(now).toISOString(),
        label: 'Ce mois',
      };
    }
    case 'year': {
      const first = new Date(now.getFullYear(), 0, 1);
      return {
        startIso: startOfDay(first).toISOString(),
        endIso: endOfDay(now).toISOString(),
        label: 'Cette année',
      };
    }
    case 'custom': {
      const s = customStart ? new Date(`${customStart}T00:00:00`) : startOfDay(now);
      const e = customEnd ? new Date(`${customEnd}T23:59:59.999`) : endOfDay(now);
      const validStart = Number.isNaN(s.getTime()) ? startOfDay(now) : s;
      const validEnd = Number.isNaN(e.getTime()) ? endOfDay(now) : e;
      return {
        startIso: validStart.toISOString(),
        endIso:
          validEnd.getTime() < validStart.getTime()
            ? endOfDay(validStart).toISOString()
            : validEnd.toISOString(),
        label: `${formatDateOnly(validStart.toISOString())} - ${formatDateOnly(
          validEnd.toISOString()
        )}`,
      };
    }
  }
}
