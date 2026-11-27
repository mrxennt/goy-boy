export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function choice<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: readonly T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '0 Min.';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} Sek.`;
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60000],
    ['hour', 3600000],
    ['day', 86400000],
    ['week', 604800000],
  ];
  for (const [unit, size] of units) {
    if (diff < size * (unit === 'minute' ? 60 : unit === 'hour' ? 24 : unit === 'day' ? 7 : 5)) {
      return rtf.format(-Math.round(diff / size), unit);
    }
  }
  return new Date(timestamp).toLocaleDateString('de-DE');
}

export function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE').format(value);
}
