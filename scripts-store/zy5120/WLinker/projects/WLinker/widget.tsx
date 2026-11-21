// WLinker - 桌面小组件
// 布局与 BMW MINI Linker 完全一致：小号（车型+锁+续航+车图）、
// 中号（左信息右车图+ALL GOOD+状态胶囊）、大号（信息区+底部地图快照）。
import {
  HStack,
  Image,
  Script,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
} from "scripting"
import type { VehicleSnapshot } from "./domain"
import { fetchVehicleSnapshotWithRelogin } from "./wuling-client"
import { loadCredential } from "./session-vault"
import {
  chargingIcon,
  displayCarName,
  formatSyncTime,
  km,
  percent,
  safetySummary,
  wgs84ToGcj02,
} from "./formatters"
import { loadMapImage } from "./map-snapshot"
import {
  loadRuntimeMode,
  loadSettings,
  loadWidgetSnapshot,
  saveConnectedSnapshot,
  setRuntimeMode,
} from "./storage"

const ACCENT = "#166DFF"
const CARD_BG = { light: "#F6F8FC", dark: "#111827" } as any
const SUB_BG = "tertiarySystemBackground"
// 五菱银标（与车况页头部一致）
const WULING_LOGO_URL =
  "https://bkimg.cdn.bcebos.com/pic/9825bc315c6034a85edf07ee32495e540923dd54d813?x-bce-process=image/resize,m_lfit,w_300,h_300,limit_1/format,f_auto"

function deepLink(route: string): string {
  return Script.createRunURLScheme("WLinker", { route })
}

// 锁车状态胶囊
function LockInfo({ snapshot }: { snapshot: VehicleSnapshot }) {
  const label = snapshot.status.doorLockStatus === 0 ? "已上锁" : snapshot.status.doorLockStatus === 1 ? "已解锁" : "锁状态未知"
  const locked = snapshot.status.doorLockStatus === 0
  const unknown = snapshot.status.doorLockStatus == null
  const color = unknown ? "#8E8E93" : locked ? "#30D158" : "#FF453A"
  const icon = locked ? "lock.shield.fill" : "xmark.shield.fill"
  return (
    <HStack
      spacing={3}
      padding={{ horizontal: 6, vertical: 3 }}
      background={`${color}1A` as any}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <Image systemName={icon} font={9} foregroundStyle={color as any} />
      <Text font={9} fontWeight="semibold" foregroundStyle={color as any} lineLimit={1}>{label}</Text>
    </HStack>
  )
}

// 状态胶囊：绿=安全 / 橙=异常（与宝马一致）
function StatusPill({ safe, text }: { safe: boolean; text: string }) {
  const color = safe ? "#30D158" : "#FF9F0A"
  const icon = safe ? "checkmark.shield.fill" : "exclamationmark.triangle.fill"
  return (
    <HStack
      spacing={3}
      padding={{ horizontal: 7, vertical: 3 }}
      background={`${color}1A` as any}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <Image systemName={icon} font={9} foregroundStyle={color as any} />
      <Text font={9} fontWeight="semibold" foregroundStyle={color as any} lineLimit={1}>{text}</Text>
    </HStack>
  )
}

// 品牌 logo（五菱银标）
function LogoView({ logo, size = 20 }: { logo: UIImage | null; size?: number }) {
  if (logo) {
    return <Image image={logo} resizable scaleToFit frame={{ width: size, height: size }} />
  }
  return <Image systemName="car.2.fill" font={size - 6} foregroundStyle={ACCENT} />
}

// 车辆图
function CarView({ car, maxHeight = 108 }: { car: UIImage | null; maxHeight?: number }) {
  return (
    <ZStack frame={{ maxWidth: Infinity, maxHeight }}>
      {car ? (
        <Image image={car} resizable scaleToFit frame={{ maxWidth: Infinity, maxHeight }} />
      ) : (
        <Image systemName="car.side.fill" font={46} foregroundStyle={ACCENT} />
      )}
    </ZStack>
  )
}

// 车况行：图标靠左、数值靠右
function StatCard({ icon, value, tone }: { icon: string; value: string; tone?: string }) {
  return (
    <HStack spacing={3} frame={{ maxWidth: Infinity, alignment: "leading" }}>
      <Image systemName={icon} font={9} foregroundStyle={ACCENT} frame={{ width: 13 }} />
      <Spacer minLength={0} />
      <Text font={10} fontWeight="semibold" lineLimit={1} minScaleFactor={0.6} foregroundStyle={(tone ?? "label") as any}>{value}</Text>
    </HStack>
  )
}

// ---------- 小号 ----------

function SmallWidget({ snapshot, car }: { snapshot: VehicleSnapshot; car: UIImage | null }) {
  // 车型名直接用 carTypeName（如 宏光MINIEV）
  const model = snapshot.info.carTypeName || snapshot.info.model || displayCarName(snapshot)
  const soc = snapshot.status.batterySoc
  const range = snapshot.status.leftMileage
  const rangeText = range != null ? `${range}km` : "—km"
  const fuelText = soc != null ? `${Math.round(soc)}%` : "—"
  // 纯电车（无燃油）副标题只显示电量百分比
  const pureEV = snapshot.status.leftFuel == null || snapshot.status.leftFuel <= 0
  const subtitle = pureEV ? fuelText : `${rangeText}/${fuelText}`
  const locked = snapshot.status.doorLockStatus === 0
  const lockColor = snapshot.status.doorLockStatus == null ? "#8E8E93" : locked ? "#30D158" : "#FF453A"
  const lockIconName = locked ? "lock.shield.fill" : "xmark.shield.fill"
  return (
    <ZStack
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      widgetURL={deepLink("overview")}
      widgetBackground={CARD_BG}
    >
      {/* 背景层：用 displaySize 精确撑满，车图放大并溢出组件（容器加高 20pt → 底部裁切 20pt） */}
      <VStack spacing={0} frame={{ width: Widget.displaySize.width, height: Widget.displaySize.height + 20, alignment: "center" }}>
        <Spacer minLength={0} />
        {car ? (
          <Image
            image={car}
            resizable
            scaleToFit
            frame={{ width: Widget.displaySize.width * 1.1, height: Widget.displaySize.height * 1.1 }}
          />
        ) : (
          <Image systemName="car.side.fill" font={46} foregroundStyle={ACCENT} />
        )}
      </VStack>
      {/* 前景层：车型 / 电量 / 时间 */}
      <VStack
        alignment="leading"
        spacing={4}
        padding={14}
        frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      >
        <HStack spacing={6}>
          <Text font="title3" fontWeight="bold" lineLimit={1} minScaleFactor={0.7}>{model}</Text>
          <Spacer minLength={0} />
          <Image systemName={lockIconName} font={14} foregroundStyle={lockColor as any} />
        </HStack>
        <HStack spacing={4}>
          <Image systemName={chargingIcon(snapshot)} font={9} foregroundStyle={ACCENT} />
          <Text font="caption" fontWeight="semibold" foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>{subtitle}</Text>
        </HStack>
        <Spacer minLength={0} />
        <HStack>
          <Spacer minLength={0} />
          <Text font={8} foregroundStyle="secondaryLabel">{formatSyncTime(snapshot)}</Text>
        </HStack>
      </VStack>
    </ZStack>
  )
}

// ---------- 中号 ----------

// 中号与大号共用：头部 + 左信息 + 右车图。fill=true 时填满可用高度（中号），false 时紧凑（大号顶部）。
function StatusBoard({ snapshot, logo, car, fill }: {
  snapshot: VehicleSnapshot
  logo: UIImage | null
  car: UIImage | null
  fill: boolean
}) {
  const s = snapshot.status
  const safety = safetySummary(snapshot)
  const isAllGood = safety.ok
  const h = fill ? { maxHeight: Infinity } : {}
  const pos = s.latitude != null && s.longitude != null ? wgs84ToGcj02(s.latitude, s.longitude) : null
  const settings = loadSettings()
  const noTiresLine1 = settings.noTiresLine1
  const noTiresLine2 = settings.noTiresLine2
  return (
    <VStack spacing={8} frame={{ maxWidth: Infinity, alignment: "topLeading" }}>
      {/* 头部：车型 + 车牌 + logo（整行） */}
      <HStack spacing={6} frame={{ maxWidth: Infinity, alignment: "leading" }}>
        <Text font="title3" fontWeight="bold" lineLimit={1} minScaleFactor={0.6}>{displayCarName(snapshot)}</Text>
        <Spacer minLength={0} />
        {snapshot.info.carPlate ? (
          <Text font={8} foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.6}>{snapshot.info.carPlate}</Text>
        ) : null}
        <LogoView logo={logo} size={16} />
      </HStack>

      {/* 主体：左信息 + 右车图 */}
      <HStack spacing={12} frame={{ maxWidth: Infinity, alignment: "leading", ...h }}>
        {/* 左列：车况 + 定位 + 刷新时间 */}
        <VStack alignment="leading" spacing={6} frame={{ width: 138, alignment: "topLeading", ...h }}>
          {/* 第一行：总里程 | 电池健康 */}
          <HStack spacing={8} frame={{ maxWidth: Infinity, alignment: "leading" }}>
            <StatCard icon="gauge.with.dots.needle.67percent" value={km(s.mileage)} />
            <StatCard icon="heart.fill" value={percent(s.batHealth)} tone={s.batHealth != null && s.batHealth < 80 ? "#FF9F0A" : undefined} />
          </HStack>
          {/* 第二行：续航 | 电量 */}
          <HStack spacing={8} frame={{ maxWidth: Infinity, alignment: "leading" }}>
            <StatCard icon="map" value={s.leftMileage != null ? `${s.leftMileage}㎞` : "—㎞"} />
            <StatCard icon="bolt.fill" value={percent(s.batterySoc)} />
          </HStack>
          {/* 第三行：无胎压占位（可配置文案） */}
          {noTiresLine1 || noTiresLine2 ? (
            <VStack alignment="leading" spacing={2}>
              {noTiresLine1 ? <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>{noTiresLine1}</Text> : null}
              {noTiresLine2 ? <Text font={9} foregroundStyle="secondaryLabel" lineLimit={1}>{noTiresLine2}</Text> : null}
            </VStack>
          ) : null}
          {/* 第四行：定位 */}
          <HStack spacing={3} frame={{ maxWidth: Infinity, alignment: "leading" }}>
            <Image systemName="location.fill" font={9} foregroundStyle="secondaryLabel" />
            <Text font={9} foregroundStyle="secondaryLabel" lineLimit={2} frame={{ maxWidth: Infinity, alignment: "leading" }}>
              {pos ? `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}` : "位置不可用"}
            </Text>
          </HStack>
          {/* 弹性空隙：仅 fill（中号）时把最后一行压到底部 */}
          {fill ? <Spacer minLength={0} /> : null}
          {/* 第五行：刷新时间 + 锁车状态 */}
          <HStack spacing={3} frame={{ maxWidth: Infinity, alignment: "leading" }}>
            <Image systemName="clock.fill" font={9} foregroundStyle="secondaryLabel" />
            <Text font={9} foregroundStyle="secondaryLabel">{formatSyncTime(snapshot)}</Text>
            <Spacer minLength={0} />
            <LockInfo snapshot={snapshot} />
          </HStack>
        </VStack>

        {/* 右列：车辆图 + ALL GOOD 水印（全正常时）+ 状态胶囊（异常时） */}
        <ZStack frame={{ maxWidth: Infinity, ...h }} padding={{ leading: 5 }}>
          {isAllGood ? (
            <Text font="title2" fontWeight="bold" lineLimit={2} frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}>{"ALL\nGOOD"}</Text>
          ) : null}
          <VStack alignment="center" spacing={0} frame={{ maxWidth: Infinity, maxHeight: Infinity }} padding={{ top: 10 }}>
            <CarView car={car} maxHeight={200} />
          </VStack>
          <HStack frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "bottom" }}>
            <Spacer minLength={0} />
            <StatusPill safe={safety.ok} text={safety.text} />
          </HStack>
        </ZStack>
      </HStack>
    </VStack>
  )
}

function MediumWidget({ snapshot, logo, car }: { snapshot: VehicleSnapshot; logo: UIImage | null; car: UIImage | null }) {
  return (
    <VStack
      spacing={0}
      padding={14}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      widgetURL={deepLink("overview")}
      widgetBackground={CARD_BG}
    >
      <StatusBoard snapshot={snapshot} logo={logo} car={car} fill />
    </VStack>
  )
}

// ---------- 大号（信息区 + 底部地图快照） ----------

function LargeWidget({ snapshot, logo, car, mapImage }: {
  snapshot: VehicleSnapshot
  logo: UIImage | null
  car: UIImage | null
  mapImage: UIImage | null
}) {
  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      widgetURL={deepLink("overview")}
      widgetBackground={CARD_BG}
    >
      {/* 模块一：信息（与中号完全一致，固定高度 155） */}
      <VStack spacing={8} padding={14} frame={{ maxWidth: Infinity, height: 155 }}>
        <StatusBoard snapshot={snapshot} logo={logo} car={car} fill />
      </VStack>

      {/* 弹性空隙：把地图压到组件底部 */}
      <Spacer minLength={0} />
      {/* 模块二：地图（高度 150，底部对齐） */}
      {mapImage ? (
        <ZStack frame={{ maxWidth: Infinity, height: 150 }}>
          <Image image={mapImage} resizable scaleToFill frame={{ maxWidth: Infinity, height: 150 }} />
        </ZStack>
      ) : (
        <VStack
          alignment="center"
          spacing={4}
          frame={{ maxWidth: Infinity, height: 150 }}
          background={SUB_BG}
        >
          <Image systemName="map.fill" font={22} foregroundStyle="secondaryLabel" />
          <Text font={9} foregroundStyle="secondaryLabel">位置不可用</Text>
        </VStack>
      )}
    </VStack>
  )
}

// ---------- 入口 ----------

async function loadLogo(): Promise<UIImage | null> {
  try {
    const image = await Promise.race([
      UIImage.fromURL(WULING_LOGO_URL),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    return image
  } catch {
    return null
  }
}

async function loadCarImage(snapshot: VehicleSnapshot): Promise<UIImage | null> {
  try {
    if (!snapshot.info.image) return null
    const image = await Promise.race([
      UIImage.fromURL(snapshot.info.image),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    return image
  } catch {
    return null
  }
}

// 组件自动刷新：保存的快照超过 30 分钟 → 向五菱拉取最新车况（失败自动重登）；
// 任何失败都回退到已有快照，保证组件永远有内容可显示。
async function refreshWidgetSnapshotIfStale(snapshot: VehicleSnapshot): Promise<VehicleSnapshot> {
  if (snapshot.source === "network") {
    const age = Date.now() - Date.parse(snapshot.cachedAt)
    if (Number.isFinite(age) && age < 30 * 60 * 1000) return snapshot
  }
  try {
    const credential = loadCredential()
    if (!credential) return snapshot
    const next = await fetchVehicleSnapshotWithRelogin()
    saveConnectedSnapshot(next)
    setRuntimeMode("connected")
    return next
  } catch {
    return snapshot
  }
}

async function main() {
  let snapshot = loadWidgetSnapshot()
  if (loadRuntimeMode() === "connected") {
    snapshot = await refreshWidgetSnapshotIfStale(snapshot)
  }
  const family = Widget.family
  const needsCar = family === "systemSmall" || family === "systemMedium" || family === "systemLarge" || family === "systemExtraLarge"
  const car = needsCar ? await loadCarImage(snapshot) : null
  const needsLogo = family === "systemMedium" || family === "systemLarge" || family === "systemExtraLarge"
  const logo = needsLogo ? await loadLogo() : null
  const mapImage = await loadMapImage()

  let content
  switch (family) {
    case "accessoryRectangular":
      content = <SmallWidget snapshot={snapshot} car={null} />
      break
    case "systemSmall":
      content = <SmallWidget snapshot={snapshot} car={car} />
      break
    case "systemMedium":
      content = <MediumWidget snapshot={snapshot} logo={logo} car={car} />
      break
    case "systemLarge":
    case "systemExtraLarge":
      content = <LargeWidget snapshot={snapshot} logo={logo} car={car} mapImage={mapImage} />
      break
    default:
      content = <SmallWidget snapshot={snapshot} car={car} />
  }

  Widget.present(content, {
    reloadPolicy: { policy: "after", date: new Date(Date.now() + 30 * 60 * 1000) },
  })
  Script.exit()
}

void main()
