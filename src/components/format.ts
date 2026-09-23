import { type Instant, MINUTE_MS, diffMinutes, toLocalParts } from '@/domain/instant'

/** "4 min ago", "3 h ago", "Fri 17:52" — whichever reads best at that distance. */
export function relativeTime(at: Instant, now: Instant): string {
  const minutes = diffMinutes(at, now)
  if (minutes < 1 && minutes > -1) return 'just now'
  if (minutes < 0) return `in ${formatSpan(-minutes)}`
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 18) return `${Math.floor(minutes / 60)} h ago`
  return formatDateTime(at)
}

function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.floor(hours / 24)} d`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Fri 18 Sep, 17:52" in London wall-clock time. */
export function formatDateTime(at: Instant): string {
  const p = toLocalParts(at)
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}, ${pad(p.hour)}:${pad(p.minute)}`
}

/** "17:52" */
export function formatTime(at: Instant): string {
  const p = toLocalParts(at)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** "Friday 18 September 2026" */
export function formatLongDate(at: Instant): string {
  const p = toLocalParts(at)
  const longDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const longMonths = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${longDays[p.weekday]} ${p.day} ${longMonths[p.month - 1]} ${p.year}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function msUntilNextMinute(now: Instant): number {
  return MINUTE_MS - (now % MINUTE_MS)
}

/** "12,480 miles" */
export function formatMileage(miles: number): string {
  return `${new Intl.NumberFormat('en-GB').format(miles)} miles`
}
