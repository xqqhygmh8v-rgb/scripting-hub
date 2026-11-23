import {
  Button, HStack, Image, List, Navigation,
  NavigationStack, Picker, ProgressView, Section, Spacer,
  Text, TextField, Toggle, VStack, ZStack,
  useEffect, useState,
} from "scripting"
import type { DynamicShapeStyle } from "scripting"
import type { Cache, Source } from "./core"
import {
  DEFAULT_SOURCES, cachedEntry, githubRetryAt, rawURL,
  repoFromSource, sourceCoolingDown,
} from "./core"
import type { Client } from "./clients"
import { CLIENTS, clientName, clientOf, isClient, unwrapResource } from "./clients"
import { CLIENT_TINT } from "./client-colors"
import type { Feedback, Tone } from "./ui"
import {
  ACCENT, CLIENT_SPECTRUM, COLOR, INK, MUTED,
  UI, ActionIcon, ClientIcon, InlineFeedback,
  SoftChip, StatusChip, StatusDot, failure, formatCount,
  stamp,
} from "./ui"

type SourceHealth = {
  label: string
  detail: string
  tone: Tone
}

function sourceHealth(source: Source, entry?: Cache[string]): SourceHealth {
  if (!source.enabled) return { label: "已停用", detail: "不参与聚合", tone: "neutral" }
  if (!entry) return { label: "待刷新", detail: "尚无可用缓存", tone: "warning" }
  const unit = entry.items[0]?.rule ? "规则集" : "模块"
  if (entry.error && entry.items.length) {
    return { label: "旧缓存", detail: `${entry.items.length} 个${unit} · ${stamp(entry.updatedAt)}`, tone: "warning" }
  }
  if (entry.error) return { label: "失败", detail: "暂无可用缓存", tone: "danger" }
  return { label: "已同步", detail: `${entry.items.length} 个${unit} · ${stamp(entry.updatedAt)}`, tone: "success" }
}

function SourceEditor({ source }: { source?: Source }) {
  const dismiss = Navigation.useDismiss()
  const [name, setName] = useState(source?.name ?? "")
  const [url, setURL] = useState(source?.url ?? "")
  const [branch, setBranch] = useState(source?.branch ?? "")
  const [client, setClient] = useState<Client>(source ? clientOf(source) : "surge")
  const [error, setError] = useState("")
  const dirty = name !== (source?.name ?? "") || url !== (source?.url ?? "") || branch !== (source?.branch ?? "") ||
    client !== (source ? clientOf(source) : "surge")
  async function cancel() {
    if (!dirty) { dismiss(); return }
    const discard = await Dialog.actionSheet({ title: "放弃未保存的修改？", actions: [{ label: "放弃修改" }] })
    if (discard === 0) dismiss()
  }
  function save() {
    try {
      if (!url.trim()) throw new Error("请填写来源网址。")
      const clean = rawURL(unwrapResource(url, client))
      const next: Source = {
        id: source?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || new URL(clean).hostname,
        url: clean, branch: branch.trim() || undefined, enabled: source?.enabled ?? true, client,
      }
      repoFromSource(next)
      dismiss(next)
    } catch (issue) { setError(issue instanceof Error ? issue.message : "地址格式不正确。") }
  }
  return <NavigationStack>
    <List listStyle="insetGroup"
      navigationTitle={source ? "编辑来源" : "添加来源"}
      navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title="取消" action={() => void cancel()} />,
        confirmationAction: <Button title="保存" disabled={!url.trim() || !dirty} action={save} /> }}>
      <Section title="所属软件">
        <HStack spacing={10}>
          <ClientIcon client={client} />
          <Picker title="软件" value={client} pickerStyle="menu"
            onChanged={(value: string) => { if (isClient(value)) setClient(value); setError("") }}>
            {CLIENTS.map(item => <Text key={item.id} tag={item.id}>{item.name}</Text>)}
          </Picker>
        </HStack>
      </Section>
      <Section header={<Text>来源地址</Text>} footer={<Text>支持仓库、模块目录、链接清单和单个模块。填写 MagicRule 首页可读取所选软件的规则集。</Text>}>
        <VStack alignment="leading" spacing={UI.gap} padding={{ vertical: UI.tight }}>
          <Text font="footnote" foregroundStyle={MUTED}>网址</Text>
          <TextField title="网址" accessibilityLabel="来源网址"
            value={url} onChanged={value => { setURL(value); setError("") }}
            prompt="https://…" axis="vertical"
            keyboardType="URL" textInputAutocapitalization="never" autocorrectionDisabled />
        </VStack>
        <VStack alignment="leading" spacing={UI.gap} padding={{ vertical: UI.tight }}>
          <Text font="footnote" foregroundStyle={MUTED}>名称（可选）</Text>
          <TextField title="名称（可选）" accessibilityLabel="来源名称，可选"
            value={name} onChanged={setName} prompt="留空使用网址的域名" />
        </VStack>
        {error ? <Text foregroundStyle={COLOR.danger.ink}>{error}</Text> : null}
      </Section>
      <Section header={<Text>GitHub 选项</Text>} footer={<Text>通常留空。分支名含斜杠时填写完整分支名。</Text>}>
        <VStack alignment="leading" spacing={UI.gap} padding={{ vertical: UI.tight }}>
          <Text font="footnote" foregroundStyle={MUTED}>分支（可选）</Text>
          <TextField title="分支（可选）" accessibilityLabel="GitHub 分支，可选"
            value={branch} onChanged={setBranch}
            prompt="使用网址中的分支或默认分支"
            textInputAutocapitalization="never" autocorrectionDisabled />
        </VStack>
      </Section>
      <Section>
        <Button title="查看支持格式" action={() => void Dialog.alert({
          title: `${clientName(client)} 来源格式`,
          message: `收集 ${CLIENTS.find(item => item.id === client)!.extensions.map(ext => `.${ext}`).join("、")} 文件。\n\nGitHub 仓库或 tree 目录：递归查找模块。\nJSON、Markdown、HTML、纯文本：提取其中的模块链接。\n单个文件：支持原始网址、GitHub blob 地址和导入链接。\n\nEgern Hub 首页支持自动读取动态清单。YAML 请填写模块或覆写目录。所有来源使用 HTTPS，源码保持原格式，由对应软件解析。`,
          buttonLabel: "知道了",
        }).catch(failure)} />
      </Section>
    </List>
  </NavigationStack>
}

function ManagerActionRow({ symbol, title, detail, tint, fill, action }: {
  symbol: string; title: string; detail: string
  tint: DynamicShapeStyle; fill: DynamicShapeStyle
  action: () => void
}) {
  return <Button buttonStyle="plain" action={action}>
    <HStack spacing={12} frame={{ maxWidth: "infinity", minHeight: 52, alignment: "leading" }} contentShape="rect">
      <Image systemName={symbol} font="body" foregroundStyle={tint} accessibilityHidden
        frame={{ width: 36, height: 36 }}
        background={{ style: fill, shape: { type: "rect", cornerRadius: 10 } }} />
      <VStack alignment="leading" spacing={UI.tight}>
        <Text font="body" fontWeight="medium" foregroundStyle={INK}>{title}</Text>
        <Text font="footnote" foregroundStyle={MUTED}>{detail}</Text>
      </VStack>
      <Spacer minLength={UI.tight} />
      <Image systemName="chevron.right" font="footnote" foregroundStyle={MUTED} accessibilityHidden />
    </HStack>
  </Button>
}

export function SourceManager({ initial }: { initial: Source[] }) {
  const dismiss = Navigation.useDismiss()
  const [sources, setSources] = useState<Source[]>(initial.map(source => ({ ...source })))
  async function edit(source?: Source) {
    const next = await Navigation.present<Source | undefined>({
      element: <SourceEditor source={source} />,
      modalPresentationStyle: "fullScreen",
    })
    if (!next) return
    setSources(previous => source ? previous.map(item => item.id === source.id ? next : item) : [...previous, next])
  }
  async function recommend() {
    const available = DEFAULT_SOURCES.filter(source => !sources.some(item => item.id === source.id))
    if (!available.length) { await Dialog.alert({ message: "所有推荐来源都已添加。" }); return }
    const selected = await Dialog.actionSheet({ title: "添加推荐来源", actions: available.map(item => ({ label: `${clientName(clientOf(item))} · ${item.name}` })) })
    if (selected != null) setSources(previous => [...previous, { ...available[selected] }])
  }
  return <NavigationStack>
    <List listStyle="insetGroup" navigationTitle="管理来源" navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title="返回" systemImage="chevron.left" labelStyle="iconOnly" action={() => dismiss()} />,
        confirmationAction: <Button title="保存" action={() => dismiss(sources)} /> }}>
      <Section header={<Text>添加</Text>} footer={<Text>左滑来源可编辑或移除。本页修改在保存后生效，返回会放弃未保存的修改。</Text>}>
        <ManagerActionRow symbol="plus" title="添加来源" detail="填写仓库、清单或模块网址"
          tint={CLIENT_TINT.surge.ink} fill={CLIENT_TINT.surge.soft} action={() => void edit().catch(failure)} />
        <ManagerActionRow symbol="sparkles" title="从推荐来源添加" detail="按代理软件浏览推荐来源"
          tint={ACCENT} fill={COLOR.accentFill} action={() => void recommend().catch(failure)} />
      </Section>
      {CLIENTS.map(client => {
        const group = sources.filter(source => clientOf(source) === client.id)
        if (!group.length) return null
        return <Section key={client.id} header={<HStack spacing={8}>
          <ClientIcon client={client.id} />
          <Text>{client.name}</Text>
          <Spacer minLength={UI.tight} />
          <Text font="footnote" foregroundStyle={MUTED}>{`${group.length} 个来源`}</Text>
        </HStack>}>
          {group.map(source => <HStack key={source.id} spacing={UI.gap}
            trailingSwipeActions={{
              allowsFullSwipe: false,
              actions: [
                <Button key="remove" title="移除" role="destructive"
                  action={() => setSources(previous => previous.filter(item => item.id !== source.id))} />,
                <Button key="edit" title="编辑" tint={ACCENT}
                  action={() => void edit(source).catch(failure)} />,
              ],
            }}>
            <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font="body">{source.name}</Text>
              <Text font="footnote" foregroundStyle={MUTED} lineLimit={1}>{source.url}</Text>
            </VStack>
            <Toggle title={`启用 ${source.name}`} labelsHidden toggleStyle="switch"
              value={source.enabled} frame={{ minHeight: UI.tap }}
              onChanged={enabled => setSources(previous => previous.map(item => item.id === source.id ? { ...item, enabled } : item))} />
          </HStack>)}
        </Section>
      })}
      {!sources.length ? <Section><Text foregroundStyle={MUTED}>还没有来源，从推荐来源开始或添加自己的清单。</Text></Section> : null}
    </List>
  </NavigationStack>
}

export function SourcesPage({ sources, cache, uniqueCount, busy, progress, message, onManage, onRefresh, onRetry, onToggle, onClose }: {
  uniqueCount: number
  sources: Source[]; cache: Cache; busy: boolean; progress: { done: number; total: number }; message: Feedback | null
  onManage: () => Promise<void>; onRefresh: () => Promise<void>; onRetry: (sources: Source[]) => Promise<void>
  onToggle: (id: string, enabled: boolean) => void
  onClose: () => void
}) {
  const enabled = sources.filter(source => source.enabled)
  const hasRules = enabled.some(source => cachedEntry(source, cache)?.items[0]?.rule)
  const failed = enabled.filter(source => cachedEntry(source, cache)?.error)
  const modules = enabled.reduce((sum, source) => sum + (cachedEntry(source, cache)?.items.length ?? 0), 0)
  const retryAt = githubRetryAt(cache)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const current = Date.now()
    setNow(current)
    if (retryAt <= current) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(retryAt - current + 100, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [retryAt])
  const ready = failed.filter(source => !sourceCoolingDown(source, cache, retryAt, now))
  const canRefresh = enabled.some(source => !sourceCoolingDown(source, cache, retryAt, now))
  const failedIds = new Set(failed.map(source => source.id))
  const latest = enabled.reduce((time, source) => {
    const entry = cachedEntry(source, cache)
    return Math.max(time, entry && (!entry.error || entry.items.length) ? entry.updatedAt : 0)
  }, 0)
  const groups = CLIENTS.map(client => ({
    client,
    sources: sources.filter(source => clientOf(source) === client.id)
      .sort((a, b) => Number(failedIds.has(b.id)) - Number(failedIds.has(a.id))),
  })).filter(group => group.sources.length)
    .sort((a, b) => Number(failedIds.has(b.sources[0].id)) - Number(failedIds.has(a.sources[0].id)))
  return <NavigationStack>
    <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="systemGroupedBackground">
    <List listStyle="insetGroup" foregroundStyle={INK}
      frame={{ maxWidth: UI.detailWidth }} navigationTitle="来源"
      navigationBarTitleDisplayMode="inline"
      refreshable={onRefresh}
      toolbar={{ cancellationAction: <Button title="关闭" action={onClose} />,
        topBarTrailing: <Button title="管理" disabled={busy} action={() => void onManage().catch(failure)} /> }}>
      <Section title="同步状态">
        <VStack alignment="leading" spacing={10} padding={{ horizontal: 12, vertical: 12 }}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={{ style: "systemBackground", shape: { type: "rect", cornerRadius: 14 } }}
          listRowSeparator="hidden">
        <HStack spacing={UI.gap} frame={{ minHeight: UI.tap }}>
          <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <HStack spacing={6}>
              <StatusDot tone={!enabled.length ? "neutral" : failed.length ? "danger" : busy ? "warning" : "success"} />
              <Text font="subheadline" fontWeight="semibold">{enabled.length
                ? `${enabled.length} 个来源已启用`
                : "没有已启用的来源"}</Text>
            </HStack>
            {modules ? <Text font="footnote" foregroundStyle={MUTED}>{`${formatCount(modules)} 条来源记录 · ${formatCount(uniqueCount)} 个独立${hasRules ? "条目" : "模块"}`}</Text> : null}
            <Text font="footnote" foregroundStyle={MUTED}>{busy ? `刷新中 · ${progress.done}/${progress.total}` :
              latest ? `最近同步 · ${stamp(latest)}` : enabled.length ? "尚无成功的同步记录" : "添加或启用来源后即可同步"}</Text>
          </VStack>
          {busy || enabled.length ? <Button buttonStyle="borderless" tint={ACCENT} disabled={busy || !canRefresh}
              accessibilityLabel={busy ? "正在刷新来源" : "刷新来源"}
              action={() => void onRefresh().catch(failure)}>
              <VStack frame={{ width: UI.tap, height: UI.tap }} fixedSize contentShape="rect">
                <ZStack frame={{ width: 36, height: 36 }}
                  background={busy || canRefresh ? COLOR.accentFill : COLOR.band} clipShape="circle">
                  {busy ? <ProgressView progressViewStyle="circular" controlSize="small" tint={ACCENT} accessibilityHidden />
                    : <Image systemName="arrow.clockwise" font={16} fontWeight="semibold"
                      foregroundStyle={canRefresh ? ACCENT : MUTED} accessibilityHidden />}
                </ZStack>
              </VStack>
            </Button> : <Button title={sources.length ? "启用" : "添加"} buttonStyle="borderless"
              accessibilityLabel={sources.length ? "启用来源" : "添加来源"}
              frame={{ minWidth: UI.tap, minHeight: UI.tap }} action={() => void onManage().catch(failure)} />}
        </HStack>
        {busy && progress.total > 0 ? <ProgressView value={progress.done} total={progress.total}
          tint={CLIENT_SPECTRUM} frame={{ height: 7 }} background={{ style: COLOR.line, shape: { type: "rect", cornerRadius: 5 } }}
          accessibilityLabel={`来源同步进度 ${progress.done} / ${progress.total}`} /> : null}
        {retryAt > now ? <Text font="footnote" foregroundStyle={COLOR.warning.ink}>
          GitHub 限流 · {stamp(retryAt)} 后可重试
        </Text> : null}
        {message ? <InlineFeedback {...message} /> : null}
        {!busy && ready.length > 1 ? <Button title={`重试 ${ready.length} 个来源`}
          action={() => void onRetry(ready).catch(failure)} /> : null}
        </VStack>
      </Section>
      {groups.map(({ client, sources: group }) => {
        const total = group.reduce((sum, source) => sum + (source.enabled ? cachedEntry(source, cache)?.items.length ?? 0 : 0), 0)
        return <Section key={client.id} header={<HStack spacing={6}>
          <ClientIcon client={client.id} />
          <Text>{client.name}来源</Text>
          <Spacer minLength={UI.tight} />
          {total ? <SoftChip label={`${formatCount(total)} 条`}
            ink={CLIENT_TINT[client.id].ink} fill={CLIENT_TINT[client.id].soft} /> : null}
        </HStack>}>
          {group.map(source => {
            const entry = cachedEntry(source, cache)
            const health = sourceHealth(source, entry)
            const cooling = source.enabled && sourceCoolingDown(source, cache, retryAt, now)
            return <HStack key={source.id} spacing={UI.gap} padding={{ vertical: UI.tight }}>
              <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity", alignment: "leading" }}
                opacity={source.enabled ? 1 : 0.5}>
                <Text font="subheadline" fontWeight="medium">{source.name}</Text>
                <HStack spacing={6}>
                  <StatusChip tone={health.tone} label={health.label} client={client.id} />
                  <Text font="footnote" foregroundStyle={MUTED} lineLimit={1}>{health.detail}</Text>
                </HStack>
                {source.enabled && (cooling || entry?.error) ? <Text font="footnote" foregroundStyle={MUTED}>
                  {cooling ? "等待 GitHub 限流解除" : entry?.error ?? ""}
                </Text> : null}
              </VStack>
              {source.enabled && entry?.error && !cooling ? <Button buttonStyle="borderless" tint={ACCENT}
                disabled={busy} accessibilityLabel={`重试 ${source.name}`} action={() => void onRetry([source]).catch(failure)}>
                <ActionIcon symbol="arrow.clockwise" />
              </Button> : null}
              <Toggle title={`启用 ${source.name}`} labelsHidden toggleStyle="switch" value={source.enabled}
                onChanged={enabled => onToggle(source.id, enabled)} />
            </HStack>
          })}
        </Section>
      })}
    </List>
    </VStack>
  </NavigationStack>
}
