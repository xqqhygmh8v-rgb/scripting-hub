import { VStack, HStack, Text, Image, Spacer, Widget } from "scripting"

// Toki widget — reads a de-identified snapshot written by index.tsx.
// NO token secrets are ever stored in this file. Widgets must render synchronously.
type SnapshotToken = { id: string; name: string; category: string; color: string; expiresAt: number }
type Snapshot = {
  v: number
  at: number
  counts: { identities: number; accounts: number; tokens: number }
  tokens: SnapshotToken[]
  soon: number
}

function loadSnapshot(): Snapshot | null {
  try {
    const path = FileManager.appGroupDocumentsDirectory + "/toki-widget.json"
    if (!FileManager.existsSync(path)) return null
    return JSON.parse(FileManager.readAsStringSync(path)) as Snapshot
  } catch {
    return null
  }
}

const snap = loadSnapshot()
const family = Widget.family
const medium = family === "systemMedium" || family === "systemLarge"
const large = family === "systemLarge"
const day = 86400000
const now = snap?.at || Date.now()

const tokens = snap?.tokens || []
const expiring = tokens
  .filter(t => t.expiresAt && t.expiresAt - now > 0 && t.expiresAt - now < 7 * day)
  .sort((a, b) => a.expiresAt - b.expiresAt)
const shown = (expiring.length ? expiring : tokens).slice(0, medium ? 3 : 1)
const soonCount = snap?.soon ?? expiring.length

function mask(name: string): string {
  if (name.length <= 2) return name + "••"
  return name.slice(0, 2) + "•••" + name.slice(-1)
}

function TokenRow({ token }: { token: SnapshotToken }) {
  const days = token.expiresAt ? Math.ceil((token.expiresAt - now) / day) : 0
  const urgent = days > 0 && days <= 7
  return (
    <HStack spacing={6}>
      <Image systemName="key.fill" foregroundStyle={urgent ? "systemOrange" : "accentColor"} />
      <Text font="caption" bold lineLimit={1}>{mask(token.name)}</Text>
      <Spacer />
      <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>{token.category}</Text>
    </HStack>
  )
}

function TokiWidget() {
  return (
    <VStack alignment="leading" spacing={medium ? 8 : 4} padding={12} widgetURL="scripting://run/Toki">
      <HStack spacing={6}>
        <Image systemName="hourglass" foregroundStyle={soonCount ? "systemOrange" : "systemGreen"} />
        <Text font="headline" bold>{soonCount}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">7 天内到期</Text>
      </HStack>
      {shown.length > 0 ? (
        <VStack alignment="leading" spacing={6}>
          {shown.map(t => <TokenRow token={t} />)}
        </VStack>
      ) : (
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>还没有密钥记录，打开 Toki 添加吧</Text>
      )}
      <Spacer minLength={0} />
      <HStack spacing={4}>
        <Image systemName="person.crop.circle" foregroundStyle="secondaryLabel" />
        <Text font="caption2" foregroundStyle="secondaryLabel">{snap?.counts.identities || 0}</Text>
        <Image systemName="square.grid.2x2.fill" foregroundStyle="secondaryLabel" />
        <Text font="caption2" foregroundStyle="secondaryLabel">{snap?.counts.accounts || 0}</Text>
        {large ? <Text font="caption2" foregroundStyle="tertiaryLabel">· Toki</Text> : null}
      </HStack>
    </VStack>
  )
}

Widget.present(<TokiWidget />)
