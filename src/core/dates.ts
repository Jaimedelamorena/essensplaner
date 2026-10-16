import type { Weekday } from './types';

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokales Datum als YYYY-MM-DD. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysBetween(fromISO: string, toISODate: string): number {
  return Math.round((parseISO(toISODate).getTime() - parseISO(fromISO).getTime()) / 86_400_000);
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayOf(iso: string): Weekday {
  return ((parseISO(iso).getDay() + 6) % 7) as Weekday;
}

/** Nächster Einkaufstag ab heute (heute eingeschlossen). */
export function nextShoppingDay(today: string, shoppingDay: Weekday): string {
  const diff = (shoppingDay - weekdayOf(today) + 7) % 7;
  return addDays(today, diff);
}

export function formatDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

export function formatAge(iso: string, today = todayISO()): string {
  const days = daysBetween(iso, today);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'vor 1 Monat' : `vor ${months} Monaten`;
}
