// Derive every client tint from the same embedded artwork used by ClientIcon.
import type { Color, DynamicShapeStyle } from "scripting"
import { CLIENTS } from "./clients"
import type { Client } from "./clients"
import { CLIENT_ICON_DATA } from "./client-icons"

type ClientTint = { ink: DynamicShapeStyle; soft: DynamicShapeStyle; solid: Color }
// Keep the complete previous palette only for missing/unsupported image APIs or artwork.
const FALLBACK_TINT: Record<Client, ClientTint> = {
  surge: { ink: { light: "#1D5FBF", dark: "#9CC7FF" }, soft: { light: "#E8F1FF", dark: "#223955" }, solid: "#1D5FBF" },
  loon: { ink: { light: "#6B49D6", dark: "#C3B0FF" }, soft: { light: "#EFEBFF", dark: "#2A2347" }, solid: "#6B49D6" },
  egern: { ink: { light: "#17795B", dark: "#7FD9B6" }, soft: { light: "#E4F5EE", dark: "#1B332C" }, solid: "#17795B" },
  stash: { ink: { light: "#A2620E", dark: "#F5C078" }, soft: { light: "#FBF0DC", dark: "#33291A" }, solid: "#A2620E" },
  shadowrocket: { ink: { light: "#0F7A86", dark: "#86DDE4" }, soft: { light: "#E2F4F6", dark: "#16323A" }, solid: "#0F7A86" },
}

function hex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()
}

// 16-level RGB histogram tolerates JPEG noise. Average the most frequent eligible
// bin; ignore transparent, nearly black/white and low-saturation background pixels.
function iconColor(client: Client): string | null {
  try {
    const image = UIImage.fromBase64String(CLIENT_ICON_DATA[client])
    CLIENT_ICON_IMAGES[client] = image
    if (!image) return null
    const pixels = image.toPixels({ format: "rgba8", alphaMode: "straight", colorSpace: "sRGB" })
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>()
    for (let y = 0; y < pixels.height; y++) {
      for (let x = 0; x < pixels.width; x++) {
        const offset = y * pixels.bytesPerRow + x * 4
        const [r, g, b, a] = pixels.data.subarray(offset, offset + 4)
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        if (a < 192 || max < 40 || min > 235 || (max - min) / max < 0.25) continue
        const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4)
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
        bin.count++; bin.r += r; bin.g += g; bin.b += b
        bins.set(key, bin)
      }
    }
    const winner = [...bins.values()].sort((a, b) => b.count - a.count)[0]
    return winner ? hex(winner.r / winner.count, winner.g / winner.count, winner.b / winner.count) : null
  } catch {
    // Older app versions may not implement toPixels. A failure affects only this client.
    CLIENT_ICON_IMAGES[client] = null
    return null
  }
}

function iconHsl(color: string): { hue: number; saturation: number } {
  const value = parseInt(color.slice(1), 16)
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { hue: (hue + 6) % 6, saturation }
}

function palette(hue: number, saturation: number): ClientTint {
  const saturationOffset = Math.max(0, Math.min(0.28, saturation - 0.72))
  const normalizedSaturation = Math.max(0.80, Math.min(1, 0.80 + saturationOffset * 0.78))
  function tone(s: number, l: number): Color {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(hue % 2 - 1)), m = l - c / 2
    const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x]
      : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x]
    return hex(...rgb.map(v => (v + m) * 255) as [number, number, number]) as Color
  }
  // More saturated artwork gets deeper tones.
  const lightInk = tone(normalizedSaturation, Math.min(0.25, 0.29 - saturationOffset * 0.35))
  return {
    ink: { light: lightInk, dark: tone(normalizedSaturation, 0.78 - saturationOffset * 0.28) },
    soft: { light: tone(normalizedSaturation, 0.90 - saturationOffset * 0.20), dark: tone(normalizedSaturation, 0.20 - saturationOffset * 0.28) },
    solid: lightInk,
  }
}

// Only five tiny thumbnails are sampled, once per script launch; no network access.
export const CLIENT_ICON_COLORS = {} as Record<Client, string | null>
export const CLIENT_TINT = {} as Record<Client, ClientTint>
// Color sampling and row rendering use the same decoded UIImage instances.
// Keeping them here avoids decoding each embedded thumbnail once for pixels and
// once again when the first list row becomes visible.
export const CLIENT_ICON_IMAGES = {} as Record<Client, UIImage | null>
const sampled: Array<{ id: Client; hue: number; saturation: number }> = []
for (const { id } of CLIENTS) {
  const color = iconColor(id)
  CLIENT_ICON_COLORS[id] = color
  if (color) sampled.push({ id, ...iconHsl(color) })
  else CLIENT_TINT[id] = FALLBACK_TINT[id]
}

// Center the ranked hues on the median icon hue. Space them 45 degrees apart
// (0.75 HSL sectors), giving the five icons a half-circle of separation.
sampled.sort((a, b) => a.hue - b.hue)
if (sampled.length > 0) {
  const middle = (sampled.length - 1) / 2
  const anchor = (sampled[Math.floor(middle)].hue + sampled[Math.ceil(middle)].hue) / 2
  sampled.forEach(({ id, saturation }, rank) => {
    const hue = (anchor + (rank - middle) * 0.75 + 6) % 6
    CLIENT_TINT[id] = palette(hue, saturation)
  })
}
