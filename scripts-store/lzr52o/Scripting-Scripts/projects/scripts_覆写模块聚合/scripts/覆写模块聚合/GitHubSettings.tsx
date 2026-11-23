import {
  Button, HStack, Link, List, Navigation,
  NavigationStack, ProgressView, Section, SecureField, Spacer,
  Text, VStack, useEffect, useRef, useState,
} from "scripting"
import type { GitHubAccount, GitHubAuthActions } from "./core"
import type { Feedback } from "./ui"
import {
  ACCENT, COLOR, GITHUB_QUOTA_GRADIENT, INK, MUTED,
  UI, InlineFeedback, StatusDot, formatCount, stamp,
} from "./ui"

export function GitHubSettings({ onChanged, auth }: { onChanged: () => void; auth: GitHubAuthActions }) {
  const dismiss = Navigation.useDismiss()
  const [token, setToken] = useState("")
  const [configured, setConfigured] = useState(auth.hasToken)
  const [login, setLogin] = useState<string | null>(null)
  const [quota, setQuota] = useState<GitHubAccount | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<Feedback | null>(null)
  const [validation, setValidation] = useState<"saved" | "valid" | "failed" | "offline">("saved")
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const quotaLimit = typeof quota?.limit === "number" && Number.isFinite(quota.limit) && quota.limit > 0
    ? quota.limit : undefined
  const quotaRemaining = quotaLimit !== undefined && typeof quota?.remaining === "number" && Number.isFinite(quota.remaining)
    ? Math.max(0, Math.min(quotaLimit, quota.remaining)) : undefined
  const locked = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    if (auth.hasToken()) void check(false)
    return () => { alive.current = false }
  }, [])

  async function check(save: boolean) {
    if (locked.current) return
    const candidate = token.trim()
    if (save && !candidate) {
      setNotice({ error: true, text: "请先粘贴 GitHub Token。" })
      return
    }
    const replacement = save && !auth.isCurrent(candidate)
    locked.current = true; setWorking(true); setNotice(null)
    try {
      const verified = await auth.verify(save ? candidate : undefined)
      if (!alive.current) return
      if (save) {
        const changed = auth.save(candidate)
        setToken(""); setConfigured(true)
        if (changed) onChanged()
      }
      setLogin(verified.login)
      setQuota(verified)
      setValidation("valid")
      setCheckedAt(verified.checkedAt)
      setNotice({ text: save ? "Token 已验证并保存到设备钥匙串。返回来源页即可刷新。" : "Token 有效，账号与额度已更新。" })
    } catch (error) {
      if (alive.current) {
        const text = error instanceof Error ? error.message : "GitHub 验证失败，请重试。"
        if (!replacement) {
          setValidation(auth.issue(error) === "network" ? "offline" : "failed")
          if (auth.issue(error) === "authentication") { setLogin(null); setQuota(null); setCheckedAt(null) }
        }
        // A failed replacement has no bearing on the saved credential's validity or quota.
        setNotice({ error: true, text: `${save ? "新 Token 未保存：" : ""}${text}` })
      }
    } finally {
      locked.current = false
      if (alive.current) setWorking(false)
    }
  }

  async function remove() {
    if (locked.current) return
    locked.current = true; setWorking(true); setNotice(null)
    try {
      const choice = await Dialog.actionSheet({ title: "移除 GitHub Token？", message: "移除后将使用匿名 API 额度，不影响现有模块与收藏。",
        actions: [{ label: "移除 Token", destructive: true }] })
      if (choice !== 0 || !alive.current) return
      auth.remove()
      setToken(""); setConfigured(false); setLogin(null); setQuota(null); setValidation("saved"); setCheckedAt(null); onChanged()
      setNotice({ text: "Token 已移除，后续请求使用匿名额度。" })
    } catch (error) {
      if (alive.current) setNotice({ error: true, text: error instanceof Error ? error.message : "移除失败，请重试。" })
    } finally {
      locked.current = false
      if (alive.current) setWorking(false)
    }
  }

  return <NavigationStack>
    <List listStyle="insetGroup" foregroundStyle={INK} frame={{ maxWidth: UI.detailWidth }}
      navigationTitle="GitHub Token" navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title="返回" systemImage="chevron.left" labelStyle="iconOnly" action={() => dismiss()} /> }}>
      <Section title="GitHub 连接" listRowSeparator="hidden">
        <VStack alignment="leading" spacing={10}
          listRowInsets={{ top: 10, bottom: 10, leading: UI.inset, trailing: UI.inset }}>
          <HStack spacing={UI.gap}>
            <StatusDot tone={configured && validation === "valid" ? "success" : validation === "offline" ? "warning" : validation === "failed" ? "danger" : "neutral"} />
            <Text font="subheadline" fontWeight="medium">{validation === "valid" && login ? `验证有效 · @${login}` : validation === "failed" ? "验证失败" : validation === "offline" ? "网络暂不可达" : configured ? "已保存 Token" : "未配置 · 匿名访问"}</Text>
          </HStack>
          <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity" }}>
            <HStack spacing={UI.gap}>
              <Text font="subheadline" fontWeight="semibold">API 额度</Text>
              <Spacer minLength={UI.tight} />
              <Button title="检查剩余额度" buttonStyle="bordered" controlSize="small" tint={ACCENT}
                disabled={working || !configured} action={() => void check(false)} />
            </HStack>
            {quotaRemaining !== undefined && quotaLimit !== undefined ? <VStack alignment="leading" spacing={6}
              frame={{ maxWidth: "infinity" }}>
              <HStack spacing={UI.gap}>
                <Text font="footnote" foregroundStyle={MUTED}>剩余请求</Text>
                <Text font="subheadline" fontWeight="semibold">{`${formatCount(quotaRemaining)} / ${formatCount(quotaLimit)} 次`}</Text>
              </HStack>
              <ProgressView value={quotaRemaining} total={quotaLimit} tint={GITHUB_QUOTA_GRADIENT}
                frame={{ height: 6 }}
                background={{ style: COLOR.line, shape: { type: "rect", cornerRadius: 3 } }}
                accessibilityLabel={`GitHub API 剩余 ${formatCount(quotaRemaining)} / ${formatCount(quotaLimit)} 次`} />
            </VStack> : <Text font="footnote" foregroundStyle={MUTED}>{!configured ? "未配置 Token，请先验证并保存。" :
              quota ? "GitHub 未返回完整的额度信息。" : working ? "正在查询额度…" : "暂未获取额度，点击按钮重试。"}</Text>}
            {quota?.resetAt ? <Text font="caption" foregroundStyle={MUTED}>{`额度重置 · ${stamp(quota.resetAt)}`}</Text> : null}
            {checkedAt ? <Text font="caption" foregroundStyle={MUTED}>{`${stamp(checkedAt)} · ${validation !== "valid" ? "上次结果 · 查询时间" : "查询时间"}`}</Text> : null}
          </VStack>
        </VStack>
      </Section>
      <Section header={<Text>{configured ? "更换 Token" : "添加 Token"}</Text>}
        footer={<Text>配置 Token 后，刷新 GitHub 来源时会使用账号的 API 额度。公开来源只需读取权限。Token 仅存于本机钥匙串，只发送到 api.github.com。</Text>}
        listRowSeparator="hidden">
        <VStack alignment="leading" spacing={UI.gap}
          listRowInsets={{ top: 10, bottom: 10, leading: UI.inset, trailing: UI.inset }}>
          <Text font="subheadline" fontWeight="medium">GitHub Token</Text>
          <SecureField title="GitHub Token" value={token}
            onChanged={value => { setToken(value); setNotice(null) }}
            prompt={configured ? "输入新的 Token，留空保留原值" : "粘贴 GitHub Token"}
            textInputAutocapitalization="never" autocorrectionDisabled disabled={working}
            padding={10} background={{ style: COLOR.band, shape: { type: "rect", cornerRadius: 8 } }} />
          <Button buttonStyle="plain" disabled={working} action={() => void check(true)}
            frame={{ maxWidth: "infinity" }}>
            <Text font="headline" fontWeight="semibold" foregroundStyle={ACCENT}
              frame={{ maxWidth: "infinity", minHeight: UI.tap }}
              background={{ style: COLOR.accentFill, shape: { type: "rect", cornerRadius: 12 } }}>验证并保存</Text>
          </Button>
          <Link url="https://github.com/settings/personal-access-tokens/new" foregroundStyle={ACCENT}
            frame={{ minHeight: UI.tap, alignment: "leading" }}>
            <Text font="footnote" foregroundStyle={ACCENT}>前往 GitHub 设置创建 Token</Text>
          </Link>
          {configured ? <Button buttonStyle="borderless" role="destructive" tint={COLOR.danger.ink}
            disabled={working} frame={{ minHeight: UI.tap, alignment: "leading" }} action={() => void remove()}>
            <Text font="subheadline" foregroundStyle={COLOR.danger.ink}>移除 Token</Text>
          </Button> : null}
        </VStack>
      </Section>
      {working || notice ? <Section>
        {working ? <HStack spacing={UI.gap}><ProgressView /><Text foregroundStyle={MUTED}>处理中…</Text></HStack> : null}
        {notice ? <InlineFeedback {...notice} /> : null}
      </Section> : null}
    </List>
  </NavigationStack>
}
