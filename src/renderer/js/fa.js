/**
 * School Bell System - Persian locale helpers
 *
 * Central place for anything that depends on locale: number formatting, the
 * Persian day/month names, and relative-time wording used in the UI.
 *
 * Digit policy: counts, percentages and durations are shown with Persian
 * digits. Clock times and file sizes deliberately stay Latin, because a bell
 * schedule is read second-by-second and the Latin form is the least ambiguous
 * in a monospace field.
 */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Day keys must stay English - they are the data-model keys. */
export const DAY_KEYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

export const DAY_NAMES_FA = {
  sunday: 'یکشنبه',
  monday: 'دوشنبه',
  tuesday: 'سه‌شنبه',
  wednesday: 'چهارشنبه',
  thursday: 'پنج‌شنبه',
  friday: 'جمعه',
  saturday: 'شنبه'
};

export const DAY_NAMES_SHORT_FA = {
  sunday: 'یک',
  monday: 'دو',
  tuesday: 'سه',
  wednesday: 'چهار',
  thursday: 'پنج',
  friday: 'جمعه',
  saturday: 'شنبه'
};

/**
 * Convert Latin digits inside a string to Persian digits.
 * @param {string|number} value
 * @returns {string}
 */
export const toPersianDigits = (value) =>
  String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/** Format an integer with thousands separators, in Persian digits. */
export const formatNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return toPersianDigits(value ?? 0);
  return toPersianDigits(n.toLocaleString('en-US'));
};

/** Human friendly byte size. Latin digits - used in file tables. */
export const formatBytes = (bytes) => {
  if (!bytes) return '۰ B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/** Persian (Jalali) long date, e.g. «۱۵ شهریور ۱۴۰۴». */
export const formatDateFa = (value, { withTime = false } = {}) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'تاریخ نامعتبر';

  const base = toPersianDigits(
    date.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
  );

  if (!withTime) return base;

  const time = toPersianDigits(
    date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
  );
  return `${base} - ${time}`;
};

/**
 * Duration until an event, in Persian words.
 * Mirrors the shape of the previous English helper:
 * 45s -> «۴۵ ثانیه» | 5m -> «۵ دقیقه» | 2h 5m -> «۲ ساعت و ۵ دقیقه»
 */
export const formatTimeUntilFa = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));

  if (total < 60) return `${toPersianDigits(total)} ثانیه`;

  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return seconds > 0
      ? `${toPersianDigits(minutes)} دقیقه و ${toPersianDigits(seconds)} ثانیه`
      : `${toPersianDigits(minutes)} دقیقه`;
  }

  if (total < 86400) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return minutes > 0
      ? `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه`
      : `${toPersianDigits(hours)} ساعت`;
  }

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  return hours > 0
    ? `${toPersianDigits(days)} روز و ${toPersianDigits(hours)} ساعت`
    : `${toPersianDigits(days)} روز`;
};

/**
 * «۰ رویداد» / «۱ رویداد» / «۸ رویداد»
 *
 * Persian keeps the noun singular when it follows a numeral, so "۸ رویداد" is
 * correct and "۸ رویدادها" is not. The «ها» suffix only appears when the noun
 * stands on its own ("رویدادهای امروز"), which callers write themselves.
 */
export const countFa = (count, singular) => {
  const n = Number(count) || 0;
  return `${toPersianDigits(n)} ${singular}`;
};

/** Backwards-compatible alias for callers still using the old name. */
export const pluralFa = countFa;

/** Uppercase helper kept because it is used for log-type labels. */
export const toFaDigits = toPersianDigits;