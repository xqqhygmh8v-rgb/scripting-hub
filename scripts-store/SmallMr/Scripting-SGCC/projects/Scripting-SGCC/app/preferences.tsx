import {
  Button,
  HStack,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  SecureField,
  Section,
  Spacer,
  Text,
  TextField,
  Widget,
  useEffect,
  useState
} from 'scripting'
import { loadUsageFeed, sendDeviceCode, toErrorMessage } from '../core/gateway'
import {
  clearUsageSnapshot,
  readAccountSecret,
  readUsageSnapshot,
  readWidgetSettings,
  writeAccountSecret,
  writeWidgetSettings
} from '../core/settings'
import type {
  CompactStyle,
  WidgetSettings,
  WidgetTheme
} from '../core/settings'
import type { WeekStart } from '../core/usage'

type AccountOption = {
  index: number
  label: string
  available: boolean
}

/** 从最近一次抓取结果里生成户号选项，失败户号也保留位置。 */
function buildAccountOptions(): AccountOption[] {
  const list = readUsageSnapshot()?.list ?? []
  return list.map((item, index) => {
    if (!item) {
      return { index, label: `户号 ${index + 1} · 未获取`, available: false }
    }
    const name =
      item.userInfo?.consName_dst ||
      item.userInfo?.orgName ||
      `户号 ${index + 1}`
    const number = String(
      item.userInfo?.consNo_dst || item.userInfo?.consNo || ''
    )
    const tail = number.length >= 4 ? ` · 尾号 ${number.slice(-4)}` : ''
    return { index, label: `${name}${tail}`, available: true }
  })
}

/** 只接受正整数的输入行。 */
function NumericRow({
  title,
  value,
  onChanged
}: {
  title: string
  value: number
  onChanged: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  return (
    <HStack>
      <Text>{title}</Text>
      <Spacer />
      <TextField
        title={title}
        value={text}
        keyboardType="numberPad"
        multilineTextAlignment="trailing"
        frame={{ width: 100 }}
        onChanged={(next: string) => {
          setText(next)
          const parsed = Number(next)
          if (Number.isInteger(parsed) && parsed > 0) onChanged(parsed)
        }}
      />
    </HStack>
  )
}

/**
 * 设置页：账号信息放在这里，偏好存 `Storage`（小组件读取），密码进钥匙串。
 * 任何一项变化都会重载桌面小组件。
 */
export function SettingsScreen() {
  const dismiss = Navigation.useDismiss()
  const [settings, setSettings] = useState<WidgetSettings>(() =>
    readWidgetSettings()
  )
  const [password, setPasswordText] = useState(() => readAccountSecret())
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [accounts, setAccounts] = useState<AccountOption[]>(() =>
    buildAccountOptions()
  )

  useEffect(() => {
    writeWidgetSettings(settings)
    Widget.reloadAll()
  }, [settings])

  useEffect(() => {
    writeAccountSecret(password)
  }, [password])

  const patch = (changes: Partial<WidgetSettings>) =>
    setSettings((previous) => ({ ...previous, ...changes }))

  const handlePhoneChange = (phone: string) => {
    // 换账号后，上一个账号的缓存不能继续显示
    if (phone !== settings.phone) {
      clearUsageSnapshot()
      setAccounts([])
      patch({ phone, accountIndex: 0 })
    } else {
      patch({ phone })
    }
  }

  const handleSendCode = async () => {
    setSending(true)
    try {
      const masked = await sendDeviceCode()
      await Dialog.alert({
        title: '短信验证码已发送',
        message: `验证码已发至 ${masked}，请在 15 分钟内填入「短信验证码」后预览组件`
      })
    } catch (error) {
      console.error(error)
      await Dialog.alert({ title: '发送失败', message: toErrorMessage(error) })
    } finally {
      setSending(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const { list, error } = await loadUsageFeed({ force: true })
      const ok = list.filter(Boolean).length
      const options = buildAccountOptions()
      setAccounts(options)
      const firstAvailable = options.find((item) => item.available)
      const currentAvailable = options.some(
        (item) => item.available && item.index === settings.accountIndex
      )
      if (!currentAvailable && firstAvailable) {
        patch({ accountIndex: firstAvailable.index })
      }
      await Dialog.alert({
        title: error ? '刷新失败，已使用缓存' : '刷新成功',
        message: error ?? `已获取 ${ok} 个户号的数据`
      })
      Widget.reloadAll()
    } catch (error) {
      console.error(error)
      await Dialog.alert({ title: '刷新失败', message: toErrorMessage(error) })
    } finally {
      setRefreshing(false)
    }
  }

  const handleClearCache = async () => {
    clearUsageSnapshot()
    setAccounts([])
    patch({ accountIndex: 0 })
    Widget.reloadAll()
    await Dialog.alert({
      title: '已清除',
      message: '下次刷新将重新请求国网数据'
    })
  }

  const openWidgetPreview = async () => {
    try {
      await Widget.preview()
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="网上国网用电"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />
        }}
      >
        <Section
          header={<Text>网上国网账号</Text>}
          footer={
            <Text>首次登录（新设备）需要短信验证：先发送验证码，再把 6 位验证码填入下方后刷新。</Text>
          }
        >
          <TextField
            title="手机号"
            prompt="手机号"
            value={settings.phone}
            keyboardType="phonePad"
            onChanged={handlePhoneChange}
          />
          <SecureField
            title="密码"
            prompt="密码"
            value={password}
            onChanged={setPasswordText}
          />
          <Button action={handleSendCode} disabled={sending}>
            <HStack>
              <Text>发送短信验证码</Text>
              <Spacer />
              {sending ? <ProgressView /> : null}
            </HStack>
          </Button>
          <TextField
            title="短信验证码"
            prompt="短信验证码"
            value={settings.smsCode}
            keyboardType="numberPad"
            onChanged={(smsCode: string) => patch({ smsCode })}
          />
        </Section>

        <Section
          header={<Text>户号</Text>}
          footer={
            <Text>刷新后会自动列出当前账号下的户号。桌面组件默认使用这里选中的户号；也可在组件参数里临时覆盖。</Text>
          }
        >
          {accounts.length > 0 ? (
            <Picker
              title="当前户号"
              value={String(settings.accountIndex)}
              onChanged={(value: string) =>
                patch({ accountIndex: Number(value) })
              }
            >
              {accounts.map((item) => (
                <Text key={String(item.index)} tag={String(item.index)}>
                  {item.label}
                </Text>
              ))}
            </Picker>
          ) : (
            <Text>暂无户号数据，请先点「立即刷新」。</Text>
          )}
        </Section>

        <Section header={<Text>数据</Text>}>
          <Button action={handleRefresh} disabled={refreshing}>
            <HStack>
              <Text>立即刷新</Text>
              <Spacer />
              {refreshing ? <ProgressView /> : null}
            </HStack>
          </Button>
          <Button title="清除数据缓存" role="destructive" action={handleClearCache} />
        </Section>

        <Section
          header={<Text>大号组件</Text>}
          footer={
            <Text>只影响大号组件的本月日历。默认周一开始；度数默认一位小数，整数不带小数点。</Text>
          }
        >
          <Picker
            title="每周起始"
            value={settings.weekStart}
            onChanged={(value: string) =>
              patch({ weekStart: value as WeekStart })
            }
          >
            <Text tag="monday">周一</Text>
            <Text tag="sunday">周日</Text>
          </Picker>
          <Picker
            title="日历小数"
            value={settings.calendarTwoDecimals ? 'on' : 'off'}
            onChanged={(value: string) =>
              patch({ calendarTwoDecimals: value === 'on' })
            }
          >
            <Text tag="off">保留一位</Text>
            <Text tag="on">保留两位</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>外观</Text>}
          footer={
            <Text>浮岛：鼠尾草画布 + 白色内卡 + 浅绿模块；格栅：纯白画布 + 中性灰模块。修改后大、中、小号一起切换。</Text>
          }
        >
          <Picker
            title="主题"
            value={settings.theme}
            onChanged={(value: string) =>
              patch({ theme: value as WidgetTheme })
            }
          >
            <Text tag="island">浮岛</Text>
            <Text tag="grid">格栅</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>数字格式</Text>}
          footer={
            <Text>关闭千分位后，本年 3,938 显示为 3938；金额同样跟随该开关。本月默认不显示小数，213.6 显示为 214。</Text>
          }
        >
          <Picker
            title="本月小数"
            value={settings.monthDecimals ? 'on' : 'off'}
            onChanged={(value: string) =>
              patch({ monthDecimals: value === 'on' })
            }
          >
            <Text tag="off">不显示</Text>
            <Text tag="on">保留一位</Text>
          </Picker>
          <Picker
            title="千分位逗号"
            value={settings.useThousands ? 'on' : 'off'}
            onChanged={(value: string) =>
              patch({ useThousands: value === 'on' })
            }
          >
            <Text tag="on">显示</Text>
            <Text tag="off">隐藏</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>阶梯</Text>}
          footer={
            <Text>按年累计电量计算，单位：度。第二阶梯上限需要大于第一阶梯上限。</Text>
          }
        >
          <NumericRow
            title="第一阶梯上限"
            value={settings.oneLevelPq}
            onChanged={(oneLevelPq) => patch({ oneLevelPq })}
          />
          <NumericRow
            title="第二阶梯上限"
            value={settings.twoLevelPq}
            onChanged={(twoLevelPq) => patch({ twoLevelPq })}
          />
        </Section>

        <Section
          header={<Text>小号组件</Text>}
          footer={
            <Text>本月：本月 + 昨日 + 阶梯；账单：上月 + 本年 + 阶梯；阶梯：阶梯主模块 + 本月。想同时放多个不同内容的小号，可在组件参数里写成 month / bill / tier。</Text>
          }
        >
          <Picker
            title="显示方式"
            value={settings.smallWidgetMode}
            onChanged={(value: string) =>
              patch({ smallWidgetMode: value as CompactStyle })
            }
          >
            <Text tag="month">本月</Text>
            <Text tag="bill">账单</Text>
            <Text tag="tier">阶梯</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>数据更新</Text>}
          footer={
            <Text>缓存超过该时长后，小组件下次刷新会重新请求国网数据；国网接口有缓存，建议不低于 4 小时。</Text>
          }
        >
          <Picker
            title="更新时间"
            value={String(settings.refreshHours)}
            onChanged={(value: string) =>
              patch({ refreshHours: Number(value) })
            }
          >
            <Text tag="4">4 小时</Text>
            <Text tag="6">6 小时</Text>
            <Text tag="8">8 小时</Text>
            <Text tag="12">12 小时</Text>
            <Text tag="24">24 小时</Text>
          </Picker>
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={
            <Text>组件参数：填 0 / 1 选户号；填 month / bill / tier 选小号内容；填 island / grid 选主题。也可写成 0;bill;grid。没有参数时使用上面的设置。</Text>
          }
        >
          <Button title="预览小组件" action={openWidgetPreview} />
        </Section>
      </List>
    </NavigationStack>
  )
}
