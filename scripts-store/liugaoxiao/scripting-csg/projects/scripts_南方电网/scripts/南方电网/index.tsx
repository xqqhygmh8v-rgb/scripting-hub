import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Rectangle,
  RoundedRectangle,
  Script,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  Widget,
  ZStack,
  useEffect,
  useState,
} from "scripting"
import { LOGIN_CHANNELS, SCRIPT_ACCENT } from "./constants"
import { presentFullScreen } from "./components/full_screen_page"
import { LocalTariffEntryPage } from "./components/local_tariff_entry_page"
import { QRLoginPage, type QRLoginResult } from "./components/qr_login_page"
import { WidgetSettingsPage } from "./components/widget_settings_page"
import { clearAllSettings, clearWidgetCache, patchSettings, readSettings, setAuthToken } from "./storage"
import { syncLinkedAccounts } from "./services/power"
import type { CSGAccount, LoginChannel } from "./types"
import { accountLabel, findAccountByPaymentNumber, formatTimestamp } from "./utils/format"

const Btn = Button as any
const COLOR_PRIMARY = SCRIPT_ACCENT
const COLOR_GREEN = "#34C759"
const COLOR_ORANGE = "#FF9500"
const COLOR_RED = "#FF3B30"
const GROUP_BACKGROUND = "#FFFFFF"
const SECONDARY = "#77777F"
const SEPARATOR = "#E2E2E5"

function MainView() {
  const dismiss = Navigation.useDismiss()
  const initialSettings = readSettings()

  const [loginChannel, setLoginChannel] = useState<LoginChannel>(initialSettings.loginChannel)
  const [paymentNumber, setPaymentNumber] = useState(initialSettings.paymentNumber)
  const [linkedAccounts, setLinkedAccounts] = useState<CSGAccount[]>(initialSettings.linkedAccounts)
  const [selectedAccountNumber, setSelectedAccountNumber] = useState(initialSettings.selectedAccount?.accountNumber ?? "")
  const [lastSyncAt, setLastSyncAt] = useState(initialSettings.lastSyncAt)
  const [customerNumber, setCustomerNumber] = useState(initialSettings.customerNumber)
  const [status, setStatus] = useState("")
  const [showClearConfirmation, setShowClearConfirmation] = useState(false)
  const [showQrLogin, setShowQrLogin] = useState(false)

  useEffect(() => {
    const selectedAccount = linkedAccounts.find((item) => item.accountNumber === selectedAccountNumber) ?? null
    patchSettings({ loginChannel, paymentNumber, linkedAccounts, selectedAccount, lastSyncAt })
  }, [lastSyncAt, linkedAccounts, loginChannel, paymentNumber, selectedAccountNumber])

  useEffect(() => {
    const matched = findAccountByPaymentNumber(linkedAccounts, paymentNumber)
    if (matched) {
      setSelectedAccountNumber(matched.accountNumber)
    }
  }, [linkedAccounts, paymentNumber])

  useEffect(() => {
    if (!status) {
      return
    }
    const timer = setTimeout(() => setStatus(""), 2200)
    return () => clearTimeout(timer)
  }, [status])

  async function handleQrLoginResult(loginResult: QRLoginResult) {
    try {
      setShowQrLogin(false)
      setLoginChannel(loginResult.channel)
      setAuthToken(loginResult.token)
      setStatus("登录成功，正在同步账户…")
      const accounts = await syncLinkedAccounts()
      const latest = readSettings()
      setLinkedAccounts(accounts)
      setSelectedAccountNumber(latest.selectedAccount?.accountNumber ?? "")
      setPaymentNumber(latest.paymentNumber)
      setLastSyncAt(latest.lastSyncAt)
      setCustomerNumber(latest.customerNumber)
      clearWidgetCache()
      Widget.reloadAll()
      setStatus(`已登录，共同步 ${accounts.length} 个缴费号`)
    } catch (error: any) {
      setStatus(String(error?.message ?? error))
    }
  }

  async function handleSyncAccounts() {
    try {
      setStatus("正在同步账户…")
      const accounts = await syncLinkedAccounts()
      const latest = readSettings()
      setLinkedAccounts(accounts)
      setSelectedAccountNumber(latest.selectedAccount?.accountNumber ?? "")
      setPaymentNumber(latest.paymentNumber)
      setLastSyncAt(latest.lastSyncAt)
      setCustomerNumber(latest.customerNumber)
      setStatus(`同步完成，共 ${accounts.length} 个缴费号`)
    } catch (error: any) {
      setStatus(String(error?.message ?? error))
    }
  }

  async function handleOpenLocalTariff() {
    await presentFullScreen<boolean>(<LocalTariffEntryPage />)
  }

  async function handleOpenWidgetSettings() {
    const applied = await presentFullScreen<boolean>(<WidgetSettingsPage />)
    if (applied) {
      setStatus("小组件样式与显示内容已保存")
    }
  }

  function handleClear() {
    clearAllSettings()
    setLinkedAccounts([])
    setSelectedAccountNumber("")
    setPaymentNumber("")
    setLastSyncAt(null)
    setCustomerNumber(null)
    setShowClearConfirmation(false)
    setStatus("已清除登录态和配置")
  }

  function handleReloadWidgets() {
    clearWidgetCache()
    Widget.reloadAll()
    setStatus("已请求刷新小组件")
  }

  const selectedAccount = linkedAccounts.find((item) => item.accountNumber === selectedAccountNumber) ?? null
  const displayAccountNumber = paymentNumber.trim() || selectedAccount?.accountNumber || "未配置"
  const accountTitle = selectedAccount?.userName?.trim() || "家庭用电"
  const loginReady = Boolean(customerNumber || linkedAccounts.length > 0 || selectedAccount)
  const hasLinkedAccounts = linkedAccounts.length > 0
  const loginChannelLabel = LOGIN_CHANNELS.find((item) => item.value === loginChannel)?.label ?? "微信"
  const selectedAccountLabel = selectedAccount ? accountLabel(selectedAccount) : hasLinkedAccounts ? "未选择" : "暂无账户"

  return <NavigationStack>
    <List
      navigationTitle="南方电网"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={{
        cancellationAction: <Btn action={dismiss} role="close">
          <Image systemName="xmark" font={14} fontWeight="semibold" frame={{ width: 44, height: 44 }} />
        </Btn>,
      }}
      toast={{
        isPresented: Boolean(status),
        onChanged: (isPresented) => {
          if (!isPresented) setStatus("")
        },
        message: status,
        duration: 2.2,
        position: "bottom",
      }}
      confirmationDialog={{
        title: "清除登录与配置？",
        titleVisibility: "visible",
        isPresented: showClearConfirmation,
        onChanged: setShowClearConfirmation,
        message: <Text>将删除本地登录态、缴费号与小组件缓存。</Text>,
        actions: <VStack>
          <Button title="清除" role="destructive" action={handleClear} />
          <Button title="取消" role="cancel" action={() => setShowClearConfirmation(false)} />
        </VStack>,
      }}
      fullScreenCover={{
        isPresented: showQrLogin,
        onChanged: setShowQrLogin,
        content: <QRLoginPage
          channel={loginChannel}
          onDismiss={() => setShowQrLogin(false)}
          onAuthenticated={handleQrLoginResult}
          onChannelChanged={setLoginChannel}
        />,
      }}
    >
      <Section>
      <CompactAccountOverview
        title={accountTitle}
        accountNumber={displayAccountNumber}
        accountCount={linkedAccounts.length}
        loginReady={loginReady}
        lastSyncAt={lastSyncAt}
      />
      </Section>

      <Section header={<Text>账户操作</Text>}>
        <AccountActionRow icon="qrcode" title="扫码登录" tint={COLOR_PRIMARY} action={() => setShowQrLogin(true)} />
        <AccountActionRow icon="arrow.triangle.2.circlepath" title="同步账户" tint={COLOR_GREEN} action={handleSyncAccounts} />
      </Section>

      <Section header={<Text>当前设置</Text>}>
        <PaymentNumberRow value={paymentNumber} onChanged={setPaymentNumber} />
        <SettingsValueRow title="扫码渠道" value={loginChannelLabel} />
        <SettingsValueRow title="已绑定账户" value={selectedAccountLabel} />
        {selectedAccount?.address?.trim() ? (
          <Text
            font={12}
            foregroundStyle="#818188"
            lineLimit={2}
            listRowInsets={{ top: 6, bottom: 8, leading: 16, trailing: 16 }}
          >
            {selectedAccount.address.trim()}
          </Text>
        ) : null}
      </Section>

      <Section header={<Text>工具</Text>}>
        <AccountActionRow icon="doc.text.viewfinder" title="录入当地电价" tint={COLOR_ORANGE} action={handleOpenLocalTariff} />
        <AccountActionRow icon="rectangle.stack.badge.plus" title="预览桌面小组件" tint={COLOR_GREEN} action={handleOpenWidgetSettings} />
        <AccountActionRow icon="arrow.clockwise" title="刷新小组件数据" tint={COLOR_PRIMARY} action={handleReloadWidgets} />
      </Section>

      <Section header={<Text>数据与隐私</Text>}>
        <Btn action={() => setShowClearConfirmation(true)} role="destructive" buttonStyle="plain">
          <HStack
            spacing={11}
            frame={{ minHeight: 54, maxWidth: "infinity", alignment: "leading" }}
            contentShape="rect"
          >
            <IconTile icon="trash.fill" tint={COLOR_RED} />
            <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font={15} fontWeight="semibold" foregroundStyle={COLOR_RED}>清除登录与配置</Text>
              <Text font={11} foregroundStyle="#818188" lineLimit={1}>删除本地登录态、缴费号与小组件缓存</Text>
            </VStack>
          </HStack>
        </Btn>
      </Section>
    </List>
  </NavigationStack>
}

function CompactAccountOverview(props: {
  title: string
  accountNumber: string
  accountCount: number
  loginReady: boolean
  lastSyncAt: string | null
}) {
  const statusColor = props.loginReady ? COLOR_GREEN : COLOR_ORANGE
  return <HStack
    spacing={11}
    frame={{ minHeight: 64, maxWidth: "infinity" }}
  >
    <ZStack frame={{ width: 36, height: 36 }}>
      <RoundedRectangle fill={COLOR_GREEN} cornerRadius={9} frame={{ width: 36, height: 36 }} />
      <Image systemName="bolt.fill" font={22} foregroundStyle="white" />
    </ZStack>
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={17} fontWeight="bold" lineLimit={1}>{props.title}</Text>
      <Text font={13} foregroundStyle={SECONDARY} lineLimit={1} minScaleFactor={0.72}>
        {props.accountNumber} · {props.accountCount} 个账户
      </Text>
    </VStack>
    <VStack alignment="trailing" spacing={3}>
      <Text font={11} fontWeight="semibold" foregroundStyle={statusColor as any}>{props.loginReady ? "已同步" : "待登录"}</Text>
      <Text font={10} foregroundStyle={SECONDARY} lineLimit={1}>{formatTimestamp(props.lastSyncAt)}</Text>
    </VStack>
  </HStack>
}

function AccountActionRow(props: { icon: string; title: string; tint: string; action: () => void | Promise<void> }) {
  return <Btn
    action={props.action}
    buttonStyle="plain"
    frame={{ maxWidth: "infinity" }}
    contentShape="rect"
    listRowInsets={{ top: 0, bottom: 0, leading: 0, trailing: 0 }}
  >
    <HStack
      spacing={11}
      padding={{ horizontal: 12, vertical: 0 }}
      frame={{ minHeight: 48, maxWidth: "infinity", alignment: "leading" }}
      background={<Rectangle fill="rgba(255,255,255,0.001)" />}
      contentShape="rect"
    >
      <IconTile icon={props.icon} tint={props.tint} />
      <Text font={16} fontWeight="medium" lineLimit={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>{props.title}</Text>
      <Image systemName="chevron.right" font={16} fontWeight="semibold" foregroundStyle="#B5B5BA" />
    </HStack>
  </Btn>
}

function SettingsValueRow(props: {
  title: string
  value: string
}) {
  return <HStack
    spacing={8}
    listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
    frame={{ minHeight: 46, maxWidth: "infinity" }}
  >
    <Text font={16}>{props.title}</Text>
    <Spacer minLength={8} />
    <Text font={15} foregroundStyle="#111114" lineLimit={1} minScaleFactor={0.72}>
      {props.value}
    </Text>
  </HStack>
}

function IconTile(props: { icon: string; tint: string }) {
  return <ZStack frame={{ width: 32, height: 32 }}>
    <RoundedRectangle fill={props.tint as any} cornerRadius={8} frame={{ width: 32, height: 32 }} />
    <Image systemName={props.icon} font={17} foregroundStyle="white" />
  </ZStack>
}

function PaymentNumberRow(props: { value: string; onChanged: (value: string) => void }) {
  return <HStack
    listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
    frame={{ minHeight: 46, maxWidth: "infinity" }}
  >
    <Text font={16}>缴费号</Text>
    <Spacer minLength={10} />
    <TextField
      title="输入缴费号"
      value={props.value}
      onChanged={props.onChanged}
      keyboardType="numberPad"
      multilineTextAlignment="trailing"
      font={15}
      lineLimit={1}
      minScaleFactor={0.68}
      frame={{ maxWidth: 220 }}
      tint={COLOR_PRIMARY}
    />
  </HStack>
}

async function run() {
  await presentFullScreen(<MainView />)
  Script.exit()
}

run()
