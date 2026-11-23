import { Widget } from 'scripting'
import { getEffectiveHolidayYear } from './core/holidays'
import { readMonthCursor } from './core/monthState'
import { readSettings } from './core/settings'
import { CalendarWidget } from './ui/calendarWidget'

function nextMidnight() {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    3,
    0
  )
}

const settings = readSettings()
const cursor = readMonthCursor()
const now = new Date()
const year = cursor?.year ?? now.getFullYear()
const holidays = getEffectiveHolidayYear(year)

Widget.present(
  <CalendarWidget settings={settings} cursor={cursor} holidays={holidays} />,
  {
    policy: 'after',
    date: nextMidnight()
  }
)
