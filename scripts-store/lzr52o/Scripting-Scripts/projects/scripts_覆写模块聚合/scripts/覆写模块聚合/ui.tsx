import {
  Button, HStack, Image, RoundedRectangle,
  Spacer, Text, VStack, ZStack, gradient,
} from "scripting"
import type { Color, DynamicShapeStyle } from "scripting"
import type { Client } from "./clients"
import { httpsURL } from "./core"
import { GITHUB_ICON_DATA } from "./client-icons"
import { CLIENT_ICON_IMAGES, CLIENT_TINT } from "./client-colors"

// Single palette. Base tones are text colors; semantic tones pair an ink with a chip fill.
export const COLOR = {
  ink: { light: "#17191C", dark: "#F2F3F5" },
  muted: { light: "#50545B", dark: "#BEC3CA" },
  accent: { light: "#1D5FBF", dark: "#9CC7FF" },
  accentFill: { light: "#E8F1FF", dark: "#223955" },
  band: { light: "#F4F7FA", dark: "#171F2C" },
  line: { light: "#E7EDF3", dark: "#293344" },
  neutral: {
    ink: { light: "#4A4F57", dark: "#C4C9D0" },
    fill: { light: "#ECEEF1", dark: "#2C2F34" },
    solid: { light: "#647183", dark: "#6E7A8B" },
  },
  success: {
    ink: { light: "#1F6B40", dark: "#7FD9A0" },
    fill: { light: "#E4F4EA", dark: "#1E3328" },
    solid: { light: "#17936A", dark: "#127A58" },
  },
  warning: {
    ink: { light: "#8A4B08", dark: "#F5BD65" },
    fill: { light: "#FBEFD9", dark: "#3A2F1C" },
    solid: { light: "#B5751A", dark: "#8F5C14" },
  },
  danger: {
    ink: { light: "#B42318", dark: "#FF9B93" },
    fill: { light: "#FBE7E5", dark: "#3B2321" },
    solid: { light: "#D0455C", dark: "#A93348" },
  },
} as const

export type Tone = keyof Pick<typeof COLOR, "neutral" | "success" | "warning" | "danger">

export const INK = COLOR.ink
export const MUTED = COLOR.muted
export const ACCENT = COLOR.accent

const countFormat = new Intl.NumberFormat("zh-CN")

const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
})

export const formatCount = (count: number) => countFormat.format(count)

// Native components own fonts, surfaces, corners and transitions. Keep custom metrics here.
export const INITIAL_MODULE_COUNT = 200

export const FILTER_VISIBLE_ROWS = 12

export const UI = { gap: 8, tight: 4, inset: 16, tap: 44, iconButton: 34, batch: 100, detailWidth: 680, clientIcon: 28, label: 92 } as const

export const CLIENT_SPECTRUM = gradient("linear", {
  colors: ["#0575E6", "#087AFF", "#021B79"], startPoint: "leading", endPoint: "trailing",
})

export const GITHUB_QUOTA_GRADIENT = gradient("linear", {
  colors: ["#00D7FF", "#087AFF", "#164DCE", "#021B79"], startPoint: "leading", endPoint: "trailing",
})

export const FAVORITE = { light: "#C98A00", dark: "#F2C14E" } as const

// Segmented thumb: opaque white / system grey, matching what UISegmentedControl
// draws. A hairline edge keeps the white pill from melting into the glass track.
// Call-to-action pill: a low-alpha blue wash keeps it soft in both modes.
export const CTA_GRADIENT = gradient("linear", {
  colors: [rgba("#1D5FBF", 0.22), rgba("#1D5FBF", 0.11)], startPoint: "top", endPoint: "bottom",
})

// Low-alpha wash built from each client's solid colour: colour reads in both modes.
function rgba(hex: string, alpha: number): Color {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})` as Color
}

export function clientWash(client: Client, top = 0.38, bottom = 0.08) {
  const solid = CLIENT_TINT[client].solid
  return gradient("linear", { colors: [rgba(solid, top), rgba(solid, bottom)], startPoint: "topLeading", endPoint: "bottomTrailing" })
}

export type Feedback = { text: string; error?: boolean; warning?: boolean }

export function InlineFeedback({ text, error, warning }: Feedback) {
  const ink = error ? COLOR.danger.ink : warning ? COLOR.warning.ink : MUTED
  return <HStack alignment="top" spacing={UI.gap} padding={{ vertical: UI.tight }} accessibilityElement="combine">
    <Image systemName={error ? "exclamationmark.circle" : warning ? "exclamationmark.triangle" : "checkmark.circle"}
      font="footnote" foregroundStyle={ink} accessibilityHidden />
    <Text font="footnote" foregroundStyle={ink}>{text}</Text>
  </HStack>
}

export function StatusChip({ tone, label, client }: { tone: Tone; label: string; client?: Client }) {
  const clientColor = tone === "success" && client ? CLIENT_TINT[client] : undefined
  const ink = clientColor?.ink ?? COLOR[tone].ink
  const fill = clientColor?.soft ?? COLOR[tone].fill
  return <Text font="caption2" fontWeight="semibold" foregroundStyle={ink} lineLimit={1} fixedSize
    padding={{ horizontal: 8, vertical: 3 }}
    background={{ style: fill, shape: { type: "rect", cornerRadius: 6 } }}>{label}</Text>
}

// Soft label for quantities and client names: tinted type on a matching wash.
export function SoftChip({ label, ink, fill }: {
  label: string; ink: DynamicShapeStyle; fill: DynamicShapeStyle
}) {
  return <Text font={11} fontWeight="semibold" foregroundStyle={ink} lineLimit={1} fixedSize
    padding={{ horizontal: 7, vertical: 3 }}
    background={{ style: fill, shape: { type: "rect", cornerRadius: 6 } }}>{label}</Text>
}

// Centred empty state with one clear call to action.
export function EmptyState({ symbol, title, message, action, onAction }: {
  symbol: string; title: string; message: string; action: string; onAction: () => void
}) {
  return <VStack spacing={6} padding={{ vertical: 24, horizontal: 20 }} frame={{ maxWidth: "infinity" }}
    listRowSeparator="hidden">
    <Image systemName={symbol} font={28} foregroundStyle={MUTED} accessibilityHidden />
    <VStack spacing={UI.tight} frame={{ maxWidth: 250 }} padding={{ top: 4 }}>
      <Text font="headline" multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>{title}</Text>
      <Text font="footnote" foregroundStyle={MUTED} multilineTextAlignment="center"
        frame={{ maxWidth: "infinity" }}>{message}</Text>
    </VStack>
    <Button buttonStyle="plain" padding={{ top: 8 }} action={onAction} accessibilityLabel={action}>
      <Text font="subheadline" fontWeight="semibold" foregroundStyle={ACCENT}
        padding={{ horizontal: 18, vertical: 9 }}
        background={{ style: CTA_GRADIENT, shape: { type: "rect", cornerRadius: 12 } }}>{action}</Text>
    </Button>
  </VStack>
}

export function StatusDot({ tone }: { tone: Tone }) {
  return <ZStack frame={{ width: 10, height: 10 }} accessibilityHidden>
    <ZStack frame={{ width: 10, height: 10 }} background={COLOR[tone].solid} clipShape="circle" opacity={0.18} />
    <ZStack frame={{ width: 5, height: 5 }} background={COLOR[tone].solid} clipShape="circle" />
  </ZStack>
}

// Reference-style parameter table: one fixed label column keeps every value aligned.
export function ParamRow({ label, value, mono, selectable }: {
  label: string; value?: string; mono?: boolean; selectable?: boolean
}) {
  const text = value?.trim() || "—"
  return <HStack alignment="top" spacing={10} padding={{ vertical: 5 }}
    frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font="footnote" foregroundStyle={MUTED} lineLimit={1} fixedSize
      frame={{ width: UI.label, alignment: "leading" }}>{label}</Text>
    <Text font="footnote" fontDesign={mono ? "monospaced" : undefined} textSelection={selectable}
      foregroundStyle={text === "—" ? MUTED : INK}
      fixedSize={{ horizontal: false, vertical: true }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}>{text}</Text>
  </HStack>
}

const CLIENT_SYMBOLS: Record<Client, string> = {
  surge: "bolt.fill", loon: "moon.fill", egern: "leaf.fill",
  stash: "archivebox.fill", shadowrocket: "paperplane.fill",
}

export function ClientIcon({ client }: { client: Client }) {
  const image = CLIENT_ICON_IMAGES[client]
  const frame = { width: UI.clientIcon, height: UI.clientIcon }
  return image
    ? <Image image={image} resizable scaleToFit frame={frame} clipShape="circle" accessibilityHidden />
    : <ZStack frame={frame} background={CLIENT_TINT[client].soft} clipShape="circle">
        <Image systemName={CLIENT_SYMBOLS[client]} font="caption" foregroundStyle={CLIENT_TINT[client].ink} accessibilityHidden />
      </ZStack>
}

export function stamp(time: number): string {
  return time ? timeFormat.format(new Date(time)) : "尚未刷新"
}

export function fileNameOf(url: string): string {
  const tail = httpsURL(url).pathname.split("/").filter(Boolean).pop()
  if (!tail) return ""
  try { return decodeURIComponent(tail) } catch { return tail }
}

export async function failure(error: unknown): Promise<void> {
  await Dialog.alert({ title: "操作未完成", message: error instanceof Error ? error.message : "请稍后重试。", buttonLabel: "知道了" })
}

export function ActionIcon({ symbol }: { symbol: string }) {
  return <VStack frame={{ width: UI.tap, height: UI.tap }} contentShape="rect">
    <Image systemName={symbol} font={14} fontWeight="medium" foregroundStyle={MUTED} accessibilityHidden
      frame={{ width: UI.iconButton, height: UI.iconButton }}
      background={{ style: COLOR.band, shape: { type: "rect", cornerRadius: 8 } }}
      overlay={<RoundedRectangle cornerRadius={8} stroke={{ shapeStyle: COLOR.line, strokeStyle: { lineWidth: 1 } }} />} />
  </VStack>
}

let githubIcon: UIImage | null | undefined

export function GitHubIcon() {
  if (githubIcon === undefined) githubIcon = UIImage.fromBase64String(GITHUB_ICON_DATA)
  const frame = { width: UI.clientIcon, height: UI.clientIcon }
  return githubIcon
    ? <Image image={githubIcon} resizable scaleToFit frame={frame} clipShape="circle" accessibilityHidden />
    : <Spacer frame={frame} />
}
