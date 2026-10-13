/**
 * Default Iranian elementary school schedule.
 *
 * Times follow a standard split session (نوبت صبح / نوبت بعدازظهر):
 * roughly 30-minute periods separated by short recesses, with a longer break
 * in the middle of the day. The first bell is 07:30 and the closing bell is
 * 12:30.
 *
 * The school week runs Saturday (شنبه) to Wednesday (چهارشنبه); Thursday
 * (پنج‌شنبه) is left empty.
 */

const BELL = {
  start: 'bell-start.wav',
  single: 'bell-single.wav',
  double: 'bell-double.wav',
  triple: 'bell-triple.wav',
  recess: 'bell-recess.wav'
};

/** @type {Array<{time: string, name: string, audio: string, notes?: string}>} */
const PERIODS = [
  { time: '07:30', name: 'زنگ اول - آغاز کلاس‌ها', audio: BELL.start },
  { time: '08:20', name: 'زنگ دوم', audio: BELL.single },
  { time: '09:10', name: 'زنگ سوم', audio: BELL.single },
  { time: '09:40', name: 'پایان نوبت صبح', audio: BELL.double },
  { time: '10:00', name: 'زنگ چهارم - نوبت بعدازظهر', audio: BELL.start },
  { time: '10:45', name: 'زنگ پنجم', audio: BELL.single },
  { time: '11:30', name: 'زنگ ششم', audio: BELL.single },
  { time: '12:30', name: 'پایان کلاس - تعطیلی', audio: BELL.triple }
];

const SCHOOL_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'];

/**
 * Thursday (پنج‌شنبه) is a half day in most schools, so it is excluded from
 * the automatic seed. It stays selectable in the UI in case a school does
 * hold classes then.
 */
const OPTIONAL_DAYS = ['thursday'];

/** Stable id so re-applying the template replaces rather than duplicates. */
const makeId = (day, time) => `default-${day}-${time.replace(':', '')}`;

/**
 * Builds the default schedule for the given days.
 * @param {string[]} [days]
 * @returns {Object<string, Array<object>>} day key -> events
 */
function buildDefaultSchedule(days = SCHOOL_DAYS) {
  const schedule = {};
  for (const day of days) {
    schedule[day] = PERIODS.map((period) => ({
      id: makeId(day, period.time),
      name: period.name,
      time: period.time,
      enabled: true,
      notes: period.notes || '',
      audioSequence: [{ audioFile: period.audio, repeat: 1 }]
    }));
  }
  return schedule;
}

/** Metadata for the bundled bell files, keyed by filename. */
function buildDefaultAudioFiles() {
  const labels = {
    [BELL.start]: 'زنگ آغاز کلاس (دو ضربه)',
    [BELL.single]: 'زنگ تک‌ضربه‌ای',
    [BELL.double]: 'زنگ پایان نوبت (دو ضربه)',
    [BELL.triple]: 'زنگ تعطیلی (سه ضربه)',
    [BELL.recess]: 'زنگ کوتاه تفریح'
  };
  const now = new Date().toISOString();
  return Object.entries(labels).map(([filename, displayName]) => ({
    id: `default-audio-${filename}`,
    filename,
    name: displayName,
    displayName,
    size: 0,
    uploadedAt: now,
    isDefault: true
  }));
}

module.exports = {
  BELL_FILES: BELL,
  DEFAULT_PERIODS: PERIODS,
  SCHOOL_DAYS,
  OPTIONAL_DAYS,
  ALL_SELECTABLE_DAYS: [...SCHOOL_DAYS, ...OPTIONAL_DAYS],
  buildDefaultSchedule,
  buildDefaultAudioFiles,
  makeDefaultId: makeId
};