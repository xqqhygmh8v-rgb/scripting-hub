export type CalendarPalette = {
  ink: string
  header: string
  muted: string
  faint: string
  outside: string
  event: string
  eventDot: string
  red: string
  work: string
  white: string
}

const LIGHT_PALETTE: CalendarPalette = {
  ink: '#1C1C1E',
  header: 'rgba(28,28,30,0.84)',
  muted: '#707075',
  faint: '#A1A1A7',
  outside: '#C9C9CE',
  event: '#7C9DA9',
  eventDot: '#9BB5BE',
  red: '#E65356',
  work: '#455B6B',
  white: '#FFFFFF'
}

const DARK_PALETTE: CalendarPalette = {
  ink: '#F6F6F7',
  header: 'rgba(246,246,247,0.88)',
  muted: 'rgba(246,246,247,0.64)',
  faint: 'rgba(246,246,247,0.46)',
  outside: 'rgba(246,246,247,0.28)',
  event: '#A7C6D0',
  eventDot: '#84AAB5',
  red: '#E65356',
  work: '#607E90',
  white: '#FFFFFF'
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203]
}

function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase()
  const named = NAMED_COLORS[value]
  if (named) return named

  if (/^#([0-9a-f]{3}|[0-9a-f]{4})$/.test(value)) {
    const hex = value.slice(1)
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16)
    ]
  }

  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(value)) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16)
    ]
  }

  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/
  )
  if (match) {
    return [
      Math.max(0, Math.min(255, Number(match[1]))),
      Math.max(0, Math.min(255, Number(match[2]))),
      Math.max(0, Math.min(255, Number(match[3])))
    ]
  }
  return null
}

export function paletteFor(background: string): CalendarPalette {
  const rgb = parseRgb(background) ?? [248, 248, 250]
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  return luminance < 0.48 ? DARK_PALETTE : LIGHT_PALETTE
}
