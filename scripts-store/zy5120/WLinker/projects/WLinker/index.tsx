// WLinker - 五菱宏光 MINIEV 车况助手
// 参照 BMW MINI Linker 模板，基于五菱官方开放接口 openapi.baojun.net。
// 仅限个人学习使用，请勿用于商业用途。
import {
  Button,
  Gauge,
  HStack,
  Image,
  LazyVGrid,
  List,
  Map,
  Marker,
  Navigation,
  NavigationLink,
  NavigationStack,
  Picker,
  ProgressView,
  ScrollView,
  Script,
  Section,
  SecureField,
  Spacer,
  Text,
  TextField,
  VStack,
  Widget,
  useEffect,
  useMemo,
  useObservable,
  useState,
} from "scripting"
import {
  credentialFromLogin,
  fetchVehicleSnapshot,
  fetchVehicleSnapshotWithRelogin,
  loginWithPassword,
  type WulingCredential,
  type WulingLoginResult,
} from "./wuling-client"
import { loadAccount, loadCredential, removeAccount, removeCredential, saveAccount, saveCredential } from "./session-vault"
import type { VehicleCheck, VehicleInfo, VehicleSnapshot, VehicleStatus } from "./domain"
import {
  batterySummary,
  celsius,
  chargingIcon,
  chargingLabel,
  checkScoreLabel,
  checkStatusLabel,
  checkSystemLabel,
  cduLabel,
  displayCarName,
  formatSyncTime,
  freshnessColor,
  freshnessLabel,
  gearLabel,
  keyLabel,
  km,
  lightLabel,
  lockIcon,
  lockLabel,
  openLabel,
  percent,
  plugLabel,
  plugStateLabel,
  rechargeStatusLabel,
  safetySummary,
  volt,
  wgs84ToGcj02,
  wireLabel,
} from "./formatters"
import { makeDemoSnapshot } from "./fixtures"
import { refreshMapSnapshot } from "./map-snapshot"
import {
  getFreshness,
  loadConnectedSnapshot,
  loadRuntimeMode,
  loadSettings,
  saveConnectedSnapshot,
  saveSettings,
  setRuntimeMode,
} from "./storage"

const PROJECT_NAME = "WLinker"
const ACCENT = "#166DFF"
const CARD = "secondarySystemBackground"
// 五菱品牌 logo（银标，百度百科「五菱银标」词条）
const WULING_LOGO_URL =
  "https://bkimg.cdn.bcebos.com/pic/9825bc315c6034a85edf07ee32495e540923dd54d813?x-bce-process=image/resize,m_lfit,w_300,h_300,limit_1/format,f_auto"

declare const Dialog: any

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error)
  const known: Record<string, string> = {
    CAR_STATUS_FAILED: "五菱服务器拒绝了状态查询，请检查凭证是否正确。",
    CAR_STATUS_NO_DATA: "账号下没有读取到车辆状态。",
    CAR_CHECK_FAILED: "健康检查接口暂时不可用。",
    CREDENTIAL_INVALID: "凭证不完整，请检查后重试。",
    SIGN_DATA_FAILED: "签名数据构造失败。",
    SMS_CODE_WRONG: "验证码错误，请重新输入。",
    SMS_CODE_EMPTY: "请输入短信验证码。",
    LOGIN_PARAMS_INVALID: "登录参数不合法，请稍后重试。",
    LOGIN_NO_TOKEN: "登录成功但未返回访问凭证，请重试。",
    TRIP_FAILED_41100_请先登录: "行程服务暂未识别当前登录会话（可能因频繁登录触发风控）。请在五菱 App 打开一次「迷你生活」页面，或稍后重新登录再试。",
    TRIP_FAILED_41100_请先登录_: "行程服务暂未识别当前登录会话（可能因频繁登录触发风控）。请在五菱 App 打开一次「迷你生活」页面，或稍后重新登录再试。",
  }
  if (known[code]) return known[code]
  if (code.startsWith("WULING_HTTP_")) return `五菱请求失败（${code.replace("WULING_HTTP_", "HTTP ")}）。`
  if (code.startsWith("WULING_NON_JSON_")) return `五菱返回异常（${code.replace("WULING_NON_JSON_", "HTTP ")}）。`
  return `操作失败：${code.slice(0, 120)}`
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "时间未知"
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

function formatDate(value?: number): string {
  if (value == null) return "—"
  let ms = value
  if (ms < 1e12) ms = ms * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function lockText(value?: number): string {
  if (value == null) return "未知"
  return value === 0 ? "已锁" : "未锁"
}

function yesNo(value?: number): string {
  if (value == null) return "未知"
  return value === 1 ? "是" : value === 0 ? "否" : String(value)
}

function StatusPill({ icon, title, color, spinner = false }: { icon?: string; title: string; color: string; spinner?: boolean }) {
  return (
    <HStack
      spacing={5}
      padding={{ horizontal: 9, vertical: 5 }}
      background={`${color}18` as any}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      {spinner ? (
        <ProgressView frame={{ width: 13, height: 13 }} />
      ) : icon ? (
        <Image systemName={icon} font="caption" foregroundStyle={color as any} />
      ) : null}
      <Text font="caption" fontWeight="semibold" foregroundStyle={color as any}>{title}</Text>
    </HStack>
  )
}

function MetricCard({
  icon,
  title,
  value,
  subtitle,
  tint = ACCENT,
}: {
  icon: string
  title: string
  value: string
  subtitle: string
  tint?: string
}) {
  return (
    <VStack
      alignment="leading"
      spacing={9}
      padding={14}
      frame={{ minHeight: 112, maxWidth: Infinity, alignment: "leading" }}
      background={CARD}
      clipShape={{ type: "rect", cornerRadius: 18, style: "continuous" }}
    >
      <HStack>
        <Image systemName={icon} font="body" foregroundStyle={tint as any} />
        <Spacer />
        <Text font="caption2" foregroundStyle="tertiaryLabel">{title}</Text>
      </HStack>
      <Text font="title2" fontWeight="bold" foregroundStyle="label" lineLimit={1} minScaleFactor={0.7}>
        {value}
      </Text>
      <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2}>{subtitle}</Text>
    </VStack>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack spacing={12} padding={{ vertical: 4 }}>
      <Text font="body" foregroundStyle="label">{label}</Text>
      <Spacer />
      <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1} minScaleFactor={0.8}>{value}</Text>
    </HStack>
  )
}

// ---------- 车辆信息详情页 ----------

function VehicleDetailsPage({ showClose = false }: { showClose?: boolean }) {
  const dismiss = Navigation.useDismiss()
  const snapshot = loadConnectedSnapshot() ?? makeDemoSnapshot()
  const info = snapshot.info
  // 只显示接口能取到的字段；取不到（空值/—）的自动隐藏
  const basicRows = [
    { label: "车名", value: info.carName },
    { label: "昵称", value: info.carNickname && info.carNickname !== info.carName ? info.carNickname : "" },
    { label: "车型", value: info.model },
    { label: "类型", value: info.carTypeName },
    { label: "颜色", value: info.colorName },
    { label: "车牌", value: info.carPlate },
  ].filter(row => row.value)
  const identityRows = [
    { label: "VIN", value: info.vin },
    { label: "系列代码", value: info.seriesCode },
    { label: "车龄", value: info.carOwnerDay != null ? `${info.carOwnerDay} 天` : "" },
    { label: "购车日期", value: formatDate(info.purchaseDate) },
    { label: "购车人", value: info.purchaseUserName },
    { label: "经销商", value: info.shopName },
    { label: "认证手机号", value: info.authenticatedUserMobile || info.bindCarUserMobile },
  ].filter(row => row.value && row.value !== "—")
  return (
    <List
      navigationTitle="车辆信息"
      navigationBarTitleDisplayMode="inline"
      toolbar={showClose ? {
        topBarLeading: [
          <Button
            title="关闭"
            systemImage="xmark.circle.fill"
            action={dismiss}
            fontWeight="semibold"
            foregroundStyle={ACCENT}
            accessibilityLabel="关闭 WLinker"
          />,
        ],
      } : undefined}
    >
      {basicRows.length > 0 ? (
        <Section header={<Text font="headline">基本</Text>}>
          {basicRows.map(row => <DetailRow key={row.label} label={row.label} value={row.value!} />)}
        </Section>
      ) : null}
      {identityRows.length > 0 ? (
        <Section header={<Text font="headline">身份</Text>}>
          {identityRows.map(row => <DetailRow key={row.label} label={row.label} value={row.value!} />)}
        </Section>
      ) : null}
      <Section header={<Text font="headline">里程</Text>}>
        <DetailRow label="总里程" value={km(snapshot.status.mileage)} />
        <DetailRow label="昨日里程" value={km(snapshot.status.yesterMileage)} />
        <DetailRow label="采集时间" value={snapshot.status.collectTime ? new Date(snapshot.status.collectTime).toLocaleString() : "—"} />
      </Section>
    </List>
  )
}

// ---------- 充电与电池详情页 ----------

function StatusDetailsPage({ showClose = false }: { showClose?: boolean }) {
  const dismiss = Navigation.useDismiss()
  const snapshot = loadConnectedSnapshot() ?? makeDemoSnapshot()
  const s = snapshot.status
  const safety = safetySummary(snapshot)
  return (
    <List
      navigationTitle="充电与电池"
      navigationBarTitleDisplayMode="inline"
      toolbar={showClose ? {
        topBarLeading: [
          <Button
            title="关闭"
            systemImage="xmark.circle.fill"
            action={dismiss}
            fontWeight="semibold"
            foregroundStyle={ACCENT}
            accessibilityLabel="关闭 WLinker"
          />,
        ],
      } : undefined}
    >
      <Section header={<Text font="headline">充电与电池</Text>}>
        <DetailRow label="充电状态" value={plugStateLabel(snapshot)} />
        <DetailRow label="电量" value={percent(s.batterySoc)} />
        <DetailRow label="续航" value={s.leftMileage != null ? `${s.leftMileage} km` : "—"} />
        {s.batSOH != null ? <DetailRow label="电池健康度 SOH" value={percent(s.batSOH)} /> : null}
        {s.batteryStatus != null ? <DetailRow label="电池状态" value={String(s.batteryStatus)} /> : null}
        <DetailRow label="电池均温" value={celsius(s.batAvgTemp)} />
        <DetailRow label="电池最低温" value={celsius(s.batMinTemp)} />
        <DetailRow label="电池最高温" value={celsius(s.batMaxTemp)} />
        <DetailRow label="动力电池电压" value={volt(s.voltage)} />
        <DetailRow label="小电瓶电压" value={volt(s.lowBatVol)} />
        <DetailRow label="小电瓶电量" value={percent(s.leftBatteryPower)} />
        {s.leftFuel != null && s.leftFuel > 0 ? <DetailRow label="剩余燃油" value={String(s.leftFuel)} /> : null}
        {s.oilLeftMileage != null && s.oilLeftMileage > 0 ? <DetailRow label="燃油剩余里程" value={km(s.oilLeftMileage)} /> : null}
        {s.hybridMileage != null && s.hybridMileage > 0 ? <DetailRow label="混动里程" value={km(s.hybridMileage)} /> : null}
        <DetailRow label="充电线连接状态" value={wireLabel(s.wireConnect)} />
        <DetailRow label="充电系统状态" value={rechargeStatusLabel(s.rechargeStatus)} />
        <DetailRow label="充电标志" value={plugLabel(s.vecChrgingSts)} />
        <DetailRow label="充电电流" value={s.obcOtpCur != null ? `${s.obcOtpCur} A` : "—"} />
        {s.chargePower != null ? <DetailRow label="充电功率" value={String(s.chargePower)} /> : null}
        {s.obcTemp != null ? <DetailRow label="充电机温度" value={celsius(s.obcTemp)} /> : null}
        <DetailRow label="电机温度" value={celsius(s.tmActTemp)} />
        <DetailRow label="逆变器温度" value={celsius(s.invActTemp)} />
      </Section>
    </List>
  )
}

// ---------- 健康检查详情页 ----------

function CheckDetailsPage({ showClose = false }: { showClose?: boolean }) {
  const dismiss = Navigation.useDismiss()
  const snapshot = loadConnectedSnapshot() ?? makeDemoSnapshot()
  const check = snapshot.check
  const s = snapshot.status
  return (
    <List
      navigationTitle="车辆检测"
      navigationBarTitleDisplayMode="inline"
      toolbar={showClose ? {
        topBarLeading: [
          <Button
            title="关闭"
            systemImage="xmark.circle.fill"
            action={dismiss}
            fontWeight="semibold"
            foregroundStyle={ACCENT}
            accessibilityLabel="关闭 WLinker"
          />,
        ],
      } : undefined}
    >
      <Section header={<Text font="headline">充电</Text>}>
        <DetailRow label="正在充电" value={s.charging === 1 ? "是" : s.charging === 0 ? "否" : "未知"} />
        <DetailRow label="充电线连接状态" value={wireLabel(s.wireConnect)} />
        <DetailRow label="充电系统状态" value={rechargeStatusLabel(s.rechargeStatus)} />
      </Section>
      {check ? (
        <>
          <Section header={<Text font="headline">电机</Text>}>
            <DetailRow label="电机综合评价" value={checkScoreLabel(check.engineScore)} />
            <DetailRow label="电机温度" value={checkStatusLabel(check.engineTemp)} />
          </Section>
          <Section header={<Text font="headline">电池</Text>}>
            <DetailRow label="电池综合评价" value={checkScoreLabel(check.batScore)} />
            <DetailRow label="电池温度" value={checkStatusLabel(check.batTemp)} />
            <DetailRow label="电池电压" value={checkStatusLabel(check.batVol)} />
            <DetailRow label="电池运行状态" value={cduLabel(check.cduState)} />
          </Section>
          <Section header={<Text font="headline">系统</Text>}>
            <DetailRow label="ABS 状态" value={checkSystemLabel(check.absio)} />
            <DetailRow label="助力系统状态" value={checkSystemLabel(check.pwrStrIo)} />
            <DetailRow label="方向盘转向助力系统状态" value={checkSystemLabel(check.cCSts)} />
          </Section>
        </>
      ) : (
        <Section header={<Text font="headline">体检</Text>}>
          <Text font="caption" foregroundStyle="secondaryLabel">该车辆未提供健康检查数据。</Text>
        </Section>
      )}
    </List>
  )
}

// ---------- Widget 预览 ----------

function WidgetPreviewPage() {
  const preview = async (family: "accessoryRectangular" | "systemSmall" | "systemMedium" | "systemLarge") => {
    await Widget.preview({ family })
  }
  return (
    <List navigationTitle="Widget 预览" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text font="headline">组件尺寸</Text>}
        footer={<Text font="caption">预览使用本地演示快照。桌面最终效果仍需真机验收。</Text>}
      >
        <Button title="锁屏矩形" systemImage="rectangle.inset.filled" action={() => void preview("accessoryRectangular")} />
        <Button title="小号" systemImage="square" action={() => void preview("systemSmall")} />
        <Button title="中号" systemImage="rectangle" action={() => void preview("systemMedium")} />
        <Button title="大号" systemImage="square.fill" action={() => void preview("systemLarge")} />
      </Section>
    </List>
  )
}

// ---------- 连接页 ----------

function ConnectionPage() {
  const dismiss = Navigation.useDismiss()
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(loadCredential() ? "已连接，可刷新或退出" : "尚未连接")
  const connected = loadCredential() != null

  const finishLogin = async (result: WulingLoginResult) => {
    const credential = credentialFromLogin(result)
    saveCredential(credential)
    saveAccount({ phone: phone.trim(), password })
    const snapshot = await fetchVehicleSnapshot(credential)
    saveConnectedSnapshot(snapshot)
    setRuntimeMode("connected")
    Widget.reloadAll()
    // 生成停车位置地图快照，供桌面大号组件使用
    if (snapshot.status.latitude != null && snapshot.status.longitude != null) {
      void refreshMapSnapshot(snapshot.status.latitude, snapshot.status.longitude)
    }
    setStatus(`连接成功：${snapshot.info.carName || "五菱宏光 MINIEV"}（${snapshot.status.mileage ?? "?"} km）`)
  }

  const passwordLogin = async () => {
    if (busy || !phone.trim() || !password) return
    setBusy(true)
    setStatus("正在使用密码登录…")
    try {
      const result = await loginWithPassword(phone.trim(), password)
      await finishLogin(result)
      setPassword("")
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    const accepted = await Dialog.confirm({
      title: "退出连接？",
      message: "将清除本机的五菱凭证与保存的手机号/密码，已同步的车况数据会保留。",
      cancelLabel: "取消",
      confirmLabel: "退出",
    })
    if (!accepted) return
    try {
      removeCredential()
      removeAccount()
      setRuntimeMode("demo")
      Widget.reloadAll()
      setStatus("已退出，当前使用演示模式")
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  return (
    <List
      navigationTitle="连接五菱"
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarTrailing: [
          <Button title="完成" action={dismiss} foregroundStyle={ACCENT} fontWeight="semibold" />,
        ],
      }}
    >
      <Section
        header={<Text font="headline">连接状态</Text>}
        footer={<Text font="caption">登录凭证只安全保存在本机钥匙串（Keychain），不会上传。</Text>}
      >
        <HStack spacing={10}>
          {busy ? <ProgressView /> : <Image systemName={connected ? "checkmark.shield.fill" : "car.badge.key.fill"} foregroundStyle={ACCENT} />}
          <Text>{status}</Text>
        </HStack>
      </Section>

      <Section
        header={<Text font="headline">手机号</Text>}
        footer={<Text font="caption">使用五菱 App（灵灵邦）注册的手机号。手机号和密码仅保存在本机钥匙串，用于刷新失败时自动重新登录。</Text>}
      >
        <TextField title="手机号" prompt="请输入 11 位手机号" value={phone} onChanged={setPhone} />
      </Section>

      <Section header={<Text font="headline">密码登录</Text>}>
        <SecureField title="密码" prompt="输入五菱账号密码" value={password} onChanged={setPassword} />
        <Button
          title={busy ? "正在登录" : "使用密码登录"}
          systemImage="key.fill"
          disabled={busy || !phone.trim() || !password}
          action={() => void passwordLogin()}
        />
      </Section>

      <Section header={<Text font="headline">会话管理</Text>}>
        <Button title="退出并清除凭证" systemImage="rectangle.portrait.and.arrow.right" role="destructive" action={signOut} />
      </Section>
    </List>
  )
}

// ---------- 设置页 ----------

function SettingsPage() {
  const settings0 = loadSettings()
  const [doorCount, setDoorCount] = useState<"2" | "4">(String(settings0.doorCount) as "2" | "4")
  const connectionDestination = useMemo(() => <ConnectionPage />, [])
  const persistDoorCount = (value: string) => {
    const count = value === "4" ? 4 : 2
    setDoorCount(value as "2" | "4")
    saveSettings({ ...loadSettings(), doorCount: count })
    Widget.reloadAll()
  }
  return (
    <List navigationTitle="设置" navigationBarTitleDisplayMode="inline">
      <Section header={<Text font="headline">五菱账号</Text>}>
        <NavigationLink destination={connectionDestination}>
          <HStack>
            <Image systemName="car.badge.key.fill" foregroundStyle={ACCENT} />
            <Text>连接与会话管理</Text>
            <Spacer />
            <Text font="caption" foregroundStyle="secondaryLabel">{loadCredential() ? "已连接" : "未连接"}</Text>
          </HStack>
        </NavigationLink>
      </Section>
      <Section
        header={<Text font="headline">车辆</Text>}
        footer={<Text font="caption">宏光 MINIEV 等车型为两门车；四门车请切换为 4 门，充电与电池页会对应显示。</Text>}
      >
        <Picker
          value={doorCount}
          onChanged={persistDoorCount}
          pickerStyle="menu"
          title="车门数"
          systemImage="car.side.fill"
        >
          <Text tag="2">2 门（宏光 MINIEV 等）</Text>
          <Text tag="4">4 门</Text>
        </Picker>
      </Section>
      <Section
        header={<Text font="headline">关于</Text>}
        footer={<Text font="caption">本工具仅供个人学习使用，请勿用于商业用途。数据来自五菱官方开放接口 openapi.baojun.net。</Text>}
      >
        <HStack>
          <Text>版本</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">0.1.0</Text>
        </HStack>
        <HStack>
          <Text>作者</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">Scripting Agent</Text>
        </HStack>
      </Section>
    </List>
  )
}

// ---------- 车况首页 ----------

function VehicleHeader({ snapshot, refreshing = false, refreshFailed = false }: { snapshot: VehicleSnapshot; refreshing?: boolean; refreshFailed?: boolean }) {
  const freshness = getFreshness(snapshot)
  const [brandLogo, setBrandLogo] = useState<UIImage | null>(null)
  useEffect(() => {
    let cancelled = false
    setBrandLogo(null)
    UIImage.fromURL(WULING_LOGO_URL)
      .then(img => { if (!cancelled && img) setBrandLogo(img) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return (
    <VStack alignment="leading" spacing={14}>
      <HStack alignment="top">
        <VStack alignment="leading" spacing={3} layoutPriority={1}>
          <Text font="largeTitle" fontWeight="bold" lineLimit={1} minScaleFactor={0.7}>
            {displayCarName(snapshot)}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {[snapshot.info.model, snapshot.info.carPlate].filter(Boolean).join(" · ") || snapshot.info.vin}
          </Text>
        </VStack>
        <Spacer />
        {brandLogo ? (
          <Image
            image={brandLogo}
            resizable
            scaleToFit
            frame={{ width: 46, height: 46 }}
            clipShape={{ type: "rect", cornerRadius: 11, style: "continuous" }}
          />
        ) : (
          <Image
            systemName="car.side.fill"
            font={34}
            foregroundStyle={ACCENT}
            symbolRenderingMode="hierarchical"
          />
        )}
      </HStack>
      <HStack spacing={8}>
        {refreshing ? (
          <StatusPill spinner title="正在刷新…" color={ACCENT} />
        ) : refreshFailed ? (
          <StatusPill icon="exclamationmark.triangle.fill" title="刷新失败" color="#FF453A" />
        ) : (
          <StatusPill
            icon={freshness === "fresh" ? "checkmark.circle.fill" : "clock.fill"}
            title={freshnessLabel(snapshot)}
            color={freshnessColor(freshness)}
          />
        )}
        <Text font="caption" foregroundStyle="tertiaryLabel">
          {relativeTime(snapshot.fetchedAt)} · {snapshot.source === "network" ? "五菱实时数据" : "演示数据"}
        </Text>
      </HStack>
      <Text font="caption" foregroundStyle="tertiaryLabel">
        最近同步 {formatSyncTime(snapshot)}
      </Text>
    </VStack>
  )
}

function EnergyHero({ snapshot }: { snapshot: VehicleSnapshot }) {
  const soc = snapshot.status.batterySoc ?? 0
  const range = snapshot.status.leftMileage
  const [carImage, setCarImage] = useState<UIImage | null>(null)
  useEffect(() => {
    let cancelled = false
    setCarImage(null)
    if (snapshot.info.image) {
      UIImage.fromURL(snapshot.info.image)
        .then(img => { if (!cancelled && img) setCarImage(img) })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [snapshot.info.image])
  return (
    <HStack
      spacing={18}
      padding={18}
      background={{ light: "#EAF2FF", dark: "#10233F" } as any}
      clipShape={{ type: "rect", cornerRadius: 24, style: "continuous" }}
      frame={{ maxWidth: Infinity, alignment: "leading" }}
    >
      <Gauge
        value={soc}
        min={0}
        max={100}
        gaugeStyle="accessoryCircularCapacity"
        tint={ACCENT}
        label={<Image systemName="bolt.fill" />}
        currentValueLabel={<Text font="headline" fontWeight="bold">{`${Math.round(soc)}%`}</Text>}
        frame={{ width: 86, height: 86 }}
      />
      <VStack alignment="leading" spacing={5} layoutPriority={1}>
        <Text font="caption" foregroundStyle="secondaryLabel">预计剩余续航</Text>
        <Text font={36} fontWeight="bold" foregroundStyle="label" lineLimit={1} minScaleFactor={0.7}>
          {range != null ? `${range} km` : "—"}
        </Text>
      </VStack>
      <Spacer />
      {carImage ? (
        <Image
          image={carImage}
          resizable
          scaleToFit
          frame={{ width: 104, height: 66 }}
        />
      ) : null}
    </HStack>
  )
}

// ---------- 车辆位置地图 ----------

function LocationMapCard({ snapshot }: { snapshot: VehicleSnapshot }) {
  const rawLat = snapshot.status.latitude
  const rawLng = snapshot.status.longitude
  if (rawLat == null || rawLng == null) return null
  // 五菱返回 WGS-84，转 GCJ-02 后在中国地图上才准
  const offset = wgs84ToGcj02(rawLat, rawLng)
  const center = { latitude: offset.latitude, longitude: offset.longitude }
  const camera = useObservable<MapCameraPosition>(
    MapCameraPosition.region({
      center,
      span: { latitudeDelta: 0.003, longitudeDelta: 0.003 },
    }),
  )
  const bounds = MapCameraBounds.centerCoordinateBounds(
    { center, span: { latitudeDelta: 0.002, longitudeDelta: 0.002 } },
    { minimumDistance: 300, maximumDistance: 800 },
  )
  return (
    <VStack alignment="leading" spacing={8}>
      <Text font="title3" fontWeight="bold">车辆位置</Text>
      <Map
        cameraPosition={camera}
        cameraBounds={bounds}
        allowsHitTesting={false}
        mapStyle={{ style: "standard", showsTraffic: false }}
        frame={{ maxWidth: Infinity, height: 200 }}
        clipShape={{ type: "rect", cornerRadius: 20 }}
      >
        <Marker
          title={snapshot.info.carName || "我的车"}
          coordinate={center}
          systemImage="car.fill"
          tint={ACCENT}
        />
      </Map>
    </VStack>
  )
}

function DashboardPage() {
  const dismiss = Navigation.useDismiss()
  const [snapshot, setSnapshot] = useState(() => loadConnectedSnapshot() ?? makeDemoSnapshot())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState("")
  const freshness = getFreshness(snapshot)
  const safety = safetySummary(snapshot)
  const infoDestination = useMemo(() => <VehicleDetailsPage />, [])
  const statusDestination = useMemo(() => <StatusDetailsPage />, [])
  const checkDestination = useMemo(() => <CheckDetailsPage />, [])
  const previewDestination = useMemo(() => <WidgetPreviewPage />, [])
  const settingsDestination = useMemo(() => <SettingsPage />, [])

  const reloadFromStorage = () => {
    setSnapshot(loadConnectedSnapshot() ?? makeDemoSnapshot())
  }

  const refresh = async () => {
    if (refreshing) return
    const credential = loadCredential()
    if (!credential && !loadAccount()) {
      setSnapshot(makeDemoSnapshot())
      setRefreshStatus("未连接车辆，已刷新演示快照")
      Widget.reloadAll()
      return
    }
    setRefreshing(true)
    setRefreshStatus("正在读取五菱车况…")
    try {
      const next = await fetchVehicleSnapshotWithRelogin()
      saveConnectedSnapshot(next)
      setRuntimeMode("connected")
      setSnapshot(next)
      setRefreshStatus("五菱车况已更新")
      Widget.reloadAll()
      // 生成停车位置地图快照，供桌面大号组件使用
      if (next.status.latitude != null && next.status.longitude != null) {
        void refreshMapSnapshot(next.status.latitude, next.status.longitude)
      }
    } catch (error) {
      setRefreshStatus(`刷新失败，继续显示上次数据：${errorMessage(error).slice(0, 100)}`)
    } finally {
      setRefreshing(false)
    }
  }

  const refreshFailed = refreshStatus.startsWith("刷新失败")
  const statusMessage = snapshot.status.statusName || snapshot.status.statusToast

  return (
    <ScrollView
      navigationTitle="车况"
      navigationBarTitleDisplayMode="large"
      onAppear={reloadFromStorage}
      toolbar={{
        topBarLeading: [
          <Button
            title="关闭"
            systemImage="xmark.circle.fill"
            action={dismiss}
            fontWeight="semibold"
            foregroundStyle={ACCENT}
            accessibilityLabel="关闭 WLinker"
          />,
        ],
        topBarTrailing: [
          <Button
            title={refreshing ? "正在刷新" : loadCredential() ? "刷新车况" : "刷新演示数据"}
            systemImage="arrow.clockwise"
            disabled={refreshing}
            action={() => void refresh()}
          />,
          <NavigationLink destination={settingsDestination}>
            <Image systemName="gearshape.fill" foregroundStyle={ACCENT} />
          </NavigationLink>,
        ],
      }}
    >
      <VStack alignment="leading" spacing={16} padding={{ horizontal: 16, top: 10, bottom: 28 }}>
        <VehicleHeader snapshot={snapshot} refreshing={refreshing} refreshFailed={refreshFailed} />
        <NavigationLink destination={statusDestination}>
          <EnergyHero snapshot={snapshot} />
        </NavigationLink>

        <LazyVGrid
          columns={[
            { size: { type: "flexible" }, spacing: 10 },
            { size: { type: "flexible" }, spacing: 10 },
          ]}
          spacing={10}
        >
          <MetricCard
            icon={lockIcon(snapshot)}
            title="车辆安全"
            value={lockLabel(snapshot)}
            subtitle={safety.text}
            tint={safety.ok ? "#30D158" : "#FF9F0A"}
          />
          <NavigationLink destination={infoDestination}>
            <MetricCard
              icon="gauge.with.dots.needle.67percent"
              title="总里程"
              value={km(snapshot.status.mileage)}
              subtitle={snapshot.source === "network" ? "五菱车辆数据" : "本地演示数据"}
            />
          </NavigationLink>
          <NavigationLink destination={checkDestination}>
            <MetricCard
              icon="heart.fill"
              title="电池健康"
              value={percent(snapshot.status.batHealth)}
              subtitle={snapshot.status.batAvgTemp != null ? `电池均温 ${celsius(snapshot.status.batAvgTemp)}` : "暂无温度数据"}
              tint="#FF9F0A"
            />
          </NavigationLink>
          <NavigationLink destination={statusDestination}>
            <MetricCard
              icon="powerplug.fill"
              title="充电枪"
              value={plugStateLabel(snapshot)}
              subtitle={rechargeStatusLabel(snapshot.status.rechargeStatus)}
              tint="#AF52DE"
            />
          </NavigationLink>
        </LazyVGrid>

        {statusMessage ? (
          <VStack alignment="leading" spacing={10}>
            <Text font="title3" fontWeight="bold">车辆状态</Text>
            <HStack
              spacing={12}
              padding={14}
              frame={{ maxWidth: Infinity, alignment: "leading" }}
              background={CARD}
              clipShape={{ type: "rect", cornerRadius: 17 }}
            >
              <Image systemName="bell.badge.fill" foregroundStyle="#FF9F0A" font="title3" />
              <VStack alignment="leading" spacing={3} layoutPriority={1}>
                <Text font="headline" lineLimit={2}>{snapshot.status.statusName || "状态"}</Text>
                {snapshot.status.statusToast ? (
                  <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={3}>{snapshot.status.statusToast}</Text>
                ) : null}
              </VStack>
            </HStack>
          </VStack>
        ) : null}

        {snapshot.status.latitude != null && snapshot.status.longitude != null ? (
          <LocationMapCard snapshot={snapshot} />
        ) : null}

        <VStack alignment="leading" spacing={10}>
          <Text font="title3" fontWeight="bold">快速查看</Text>
          <NavigationLink destination={previewDestination}>
            <HStack spacing={12} padding={14} background={CARD} clipShape={{ type: "rect", cornerRadius: 17 }}>
              <Image systemName="square.grid.2x2.fill" foregroundStyle="#AF52DE" font="title3" />
              <VStack alignment="leading" spacing={2}>
                <Text font="headline">Widget 预览</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">锁屏、小号、中号和大号</Text>
              </VStack>
              <Spacer />
              <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
            </HStack>
          </NavigationLink>
        </VStack>

      </VStack>
    </ScrollView>
  )
}

function RootView() {
  return <NavigationStack><DashboardPage /></NavigationStack>
}

async function main() {
  try {
    loadConnectedSnapshot()
    await Navigation.present({ element: <RootView />, modalPresentationStyle: "overFullScreen" })
  } catch (error: any) {
    const message = error?.message ? String(error.message) : String(error)
    try {
      await Dialog?.alert?.({ title: `${PROJECT_NAME} 无法打开`, message, buttonLabel: "关闭" })
    } catch {}
  } finally {
    Script.exit()
  }
}

void main()
