import {
  Button,
  Image,
  List,
  NavigationStack,
  Picker,
  ProgressView,
  Rectangle,
  RoundedRectangle,
  Script,
  Section,
  Text,
  VStack,
  fetch,
  useEffect,
  useState,
} from "scripting"
import { LOGIN_CHANNELS, QR_POLL_INTERVAL_MS } from "../constants"
import { createLoginQrCode, queryQrLoginStatus } from "../api/auth"
import type { LoginChannel } from "../types"
import { PrimaryButton } from "./full_screen_page"

export type QRLoginResult = {
  token: string
  channel: LoginChannel
}

export function QRLoginPage({
  channel,
  onDismiss,
  onAuthenticated,
  onChannelChanged,
}: {
  channel: LoginChannel
  onDismiss: () => void
  onAuthenticated: (result: QRLoginResult) => void | Promise<void>
  onChannelChanged?: (channel: LoginChannel) => void
}) {
  const [selectedChannel, setSelectedChannel] = useState<LoginChannel>(channel)
  const [qrImageUrl, setQrImageUrl] = useState("")
  const [loginId, setLoginId] = useState("")
  const [statusText, setStatusText] = useState("正在生成二维码…")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [hasOpenedScanner, setHasOpenedScanner] = useState(false)

  function selectChannel(nextChannel: LoginChannel) {
    if (nextChannel === selectedChannel) {
      return
    }
    console.log("[CSG] qrLogin:channelChanged", selectedChannel, "->", nextChannel)
    setSelectedChannel(nextChannel)
    onChannelChanged?.(nextChannel)
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setQrImageUrl("")
    setLoginId("")
    setHasOpenedScanner(false)
    setIsLoading(true)
    setStatusText(selectedChannel === "wechat"
      ? "正在生成微信二维码…"
      : "正在生成南网在线二维码…")

    async function bootstrap() {
      try {
        console.log("[CSG] qrLogin:createQr", selectedChannel)
        const result = await createLoginQrCode(selectedChannel)
        if (cancelled) {
          return
        }
        setLoginId(result.loginId)
        setQrImageUrl(result.qrImageUrl)
        setStatusText(selectedChannel === "wechat"
          ? "微信二维码会进入南方电网公众号，完成授权后返回本页检查结果"
          : "请打开南网在线 App，使用扫一扫从相册识别二维码")
        setIsLoading(false)

        const poll = async () => {
          try {
            const status = await queryQrLoginStatus(selectedChannel, result.loginId)
            if (cancelled) {
              return
            }
            if (status.ok && status.token) {
              await onAuthenticated({ token: status.token, channel: selectedChannel })
              return
            }
          } catch (error: any) {
            if (!cancelled) {
              setStatusText(String(error?.message ?? error))
            }
          }
          if (!cancelled) {
            timer = setTimeout(poll, QR_POLL_INTERVAL_MS)
          }
        }
        timer = setTimeout(poll, QR_POLL_INTERVAL_MS)
      } catch (error: any) {
        if (!cancelled) {
          setStatusText(String(error?.message ?? error))
          setIsLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [selectedChannel])

  async function checkLoginNow() {
    if (!loginId || isChecking) {
      return
    }
    try {
      setIsChecking(true)
      setStatusText("正在检查登录结果…")
      const status = await queryQrLoginStatus(selectedChannel, loginId)
      if (status.ok && status.token) {
        await onAuthenticated({ token: status.token, channel: selectedChannel })
        return
      }
      setStatusText("暂未检测到授权，请完成扫码后再试")
    } catch (error: any) {
      setStatusText(String(error?.message ?? error))
    } finally {
      setIsChecking(false)
    }
  }

  async function saveAndOpenScanner() {
    if (!qrImageUrl || isSaving) {
      return
    }
    try {
      setIsSaving(true)
      const granted = await Script.requestAccess(["photos"])
      if (!granted.includes("photos")) {
        throw new Error("未获得相册访问权限，请在 Scripting 设置中允许后重试")
      }
      const response = await fetch(qrImageUrl, { timeout: 20 })
      if (!response.ok) {
        throw new Error(`二维码下载失败（HTTP ${response.status}）`)
      }
      const imageData = Data.fromArrayBuffer(await response.arrayBuffer())
      if (!imageData) {
        throw new Error("二维码图片转换失败")
      }
      const saved = await Photos.savePhoto(imageData, { fileName: `csg-login-${Date.now()}.png` })
      if (!saved) {
        throw new Error("保存到相册失败")
      }
      setStatusText("二维码已保存，请在扫一扫中从相册选择")
      setHasOpenedScanner(true)
      if (selectedChannel === "wechat") {
        const opened = await Safari.openURL("weixin://scanqrcode")
        if (!opened) {
          throw new Error("无法打开微信，二维码已保存，请手动打开扫一扫并从相册选择")
        }
      } else {
        setStatusText("二维码已保存。请打开南网在线 App，进入扫一扫并从相册选择，然后返回此页检查结果")
      }
    } catch (error: any) {
      setStatusText(String(error?.message ?? error))
    } finally {
      setIsSaving(false)
    }
  }

  return <NavigationStack>
    <List
      navigationTitle="扫码登录"
      navigationBarTitleDisplayMode="inline"
      listStyle="plain"
      scrollContentBackground="hidden"
      listSectionSpacing={0}
      background={<Rectangle fill="#F2F2F7" />}
      toolbar={{
        cancellationAction: <Button title="返回" action={onDismiss} />,
      }}
    >
      <Section listSectionSeparator="hidden">
        <VStack
          alignment="center"
          spacing={0}
          frame={{ maxWidth: "infinity" }}
          listRowInsets={{ top: 16, bottom: 8, leading: 16, trailing: 16 }}
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
        >
          <VStack
            alignment="center"
            frame={{ width: 58, height: 58 }}
            background={<RoundedRectangle fill="#0A84FF" cornerRadius={14} />}
          >
            <Image systemName="qrcode" font={28} foregroundStyle="white" />
          </VStack>
          <Text font={20} fontWeight="bold" padding={{ top: 12, bottom: 5 }}>扫码登录</Text>
          <Text font={13} foregroundStyle="#76767E" lineLimit={2}>
            使用所选渠道扫描二维码，授权后同步绑定账户。
          </Text>
        </VStack>

        <Picker
          title="扫码渠道"
          value={selectedChannel}
          onChanged={(value: string) => selectChannel(value as LoginChannel)}
          pickerStyle="segmented"
          frame={{ maxWidth: "infinity", height: 38 }}
          listRowInsets={{ top: 14, bottom: 14, leading: 16, trailing: 16 }}
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
        >
          {LOGIN_CHANNELS.map((item) => (
            <Text tag={item.value}>{item.label}</Text>
          ))}
        </Picker>

        <VStack
          alignment="center"
          frame={{ maxWidth: "infinity" }}
          listRowInsets={{ top: 16, bottom: 12, leading: 16, trailing: 16 }}
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
        >
          <VStack
            alignment="center"
            spacing={8}
            padding={18}
            frame={{ width: 232, minHeight: 236 }}
            background={<RoundedRectangle fill="white" cornerRadius={10} />}
          >
            {isLoading ? (
              <VStack frame={{ width: 176, height: 176 }}>
                <ProgressView progressViewStyle="circular" />
              </VStack>
            ) : qrImageUrl ? (
              <Image
                imageUrl={qrImageUrl}
                frame={{ width: 176, height: 176 }}
                clipShape={{ type: "rect", cornerRadius: 2 }}
              />
            ) : (
              <Image systemName="qrcode" font={90} foregroundStyle="#15243B" frame={{ width: 176, height: 176 }} />
            )}
            <Text font={11} foregroundStyle="#77777F" lineLimit={2} minScaleFactor={0.72}>{statusText}</Text>
          </VStack>
        </VStack>

        <VStack
          listRowInsets={{ top: 12, bottom: 28, leading: 16, trailing: 16 }}
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
        >
          <PrimaryButton
            title={isChecking
              ? "正在检查…"
              : hasOpenedScanner
                ? "完成授权并检查结果"
                : isSaving
                  ? "正在保存…"
                  : selectedChannel === "wechat"
                    ? "保存并打开微信扫一扫"
                    : "保存二维码并查看操作说明"}
            systemImage={hasOpenedScanner ? "checkmark.circle.fill" : "qrcode.viewfinder"}
            action={hasOpenedScanner ? checkLoginNow : saveAndOpenScanner}
            disabled={!qrImageUrl || isSaving || isChecking}
          />
        </VStack>
      </Section>
    </List>
  </NavigationStack>
}
