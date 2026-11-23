import {
  Button, DisclosureGroup, HStack, Image, Link,
  List, Navigation, NavigationStack, ProgressView, Section,
  Spacer, Text, VStack, useEffect,
  useRef, useState,
} from "scripting"
import type { VirtualNode } from "scripting"
import type { CatalogueItem, GetText, RuleFile } from "./core"
import { httpsURL, magicRulePage, parseModule, ruleFiles } from "./core"
import type { Client } from "./clients"
import {
  IMPORT_GUIDES, buildImportURL, buildUniversalImportURL, clientName, clientOf,
} from "./clients"
import { CLIENT_TINT } from "./client-colors"
import type { Feedback } from "./ui"
import {
  ACCENT, COLOR, INK, MUTED,
  UI, ClientIcon, InlineFeedback, ParamRow,
  clientWash, failure, fileNameOf, formatCount,
} from "./ui"
import { useModuleImport } from "./useModuleImport"

function DetailPage({ kind, marked, onToggle, children }: {
  kind: "模块" | "规则集"; marked: boolean; onToggle: () => void; children: VirtualNode
}) {
  const dismiss = Navigation.useDismiss()
  return <NavigationStack>
    <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="systemGroupedBackground">
      <List listStyle="insetGroup" foregroundStyle={INK} frame={{ maxWidth: UI.detailWidth }}
        navigationTitle={`${kind}详情`} navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title="返回" systemImage="chevron.left" labelStyle="iconOnly" action={() => dismiss()} />,
          topBarTrailing: <Button key="favorite" title={marked ? "已收藏" : "收藏"} systemImage={marked ? "star.fill" : "star"} labelStyle="iconOnly"
            accessibilityLabel={`${marked ? "取消收藏" : "收藏"}${kind}`} action={onToggle} /> }}>
        {children}
      </List>
    </VStack>
  </NavigationStack>
}

function DetailHero({ client, kind, title, description, byline }: {
  client: Client; kind: string; title: string; description: string; byline?: string
}) {
  return <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}
    padding={{ horizontal: 12, vertical: 12 }}
    background={{ style: clientWash(client), shape: { type: "rect", cornerRadius: 14 } }}>
    <HStack alignment="top" spacing={12}>
      <ClientIcon client={client} />
      <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="title3" fontWeight="semibold" lineLimit={3} accessibilityHeading="h1">{title}</Text>
        <HStack spacing={UI.tight}>
          <Text font="subheadline" fontWeight="semibold" foregroundStyle={CLIENT_TINT[client].ink}>{clientName(client)}</Text>
          <Text font="caption" foregroundStyle={MUTED}>·</Text>
          <Text font="subheadline" foregroundStyle={MUTED}>{kind}</Text>
        </HStack>
        {byline ? <Text font="caption" foregroundStyle={MUTED} lineLimit={1}>{byline}</Text> : null}
      </VStack>
    </HStack>
    <Text font="body" foregroundStyle={description ? INK : MUTED} lineLimit={6}>{description || `暂无${kind}说明`}</Text>
  </VStack>
}

function DetailAction({ client, title, action, disabled, accessibilityLabel }: {
  client: Client; title: string; action: () => void; disabled?: boolean; accessibilityLabel?: string
}) {
  return <Button disabled={disabled} buttonStyle="plain" frame={{ maxWidth: "infinity" }} action={action} accessibilityLabel={accessibilityLabel || title}>
    <Text font="headline" fontWeight="semibold" foregroundStyle={CLIENT_TINT[client].ink}
      frame={{ maxWidth: "infinity" }} padding={{ vertical: 14 }}
      background={{ style: clientWash(client, 0.3, 0.14), shape: { type: "rect", cornerRadius: 12 } }}>{title}</Text>
  </Button>
}

export function Detail({ item, favorite, onFavorite, onMetadata, loadText }: {
  loadText: GetText
  item: CatalogueItem; favorite: boolean; onFavorite: (item: CatalogueItem, marked: boolean) => boolean
  onMetadata: (url: string, metadata: ReturnType<typeof parseModule>, client: Client) => boolean
}) {
  const [marked, setMarked] = useState(favorite)
  const [meta, setMeta] = useState<ReturnType<typeof parseModule> | null>(null)
  const [loading, setLoading] = useState(false)
  const [sourceExpanded, setSourceExpanded] = useState(false)
  const [feedback, setFeedback] = useState<(Feedback & { scope: "action" | "address" | "import" | "link" }) | null>(null)
  const [readFeedback, setReadFeedback] = useState<(Feedback & { retry: boolean }) | null>(null)
  const alive = useRef(true)
  const reading = useRef(false)
  const importer = useModuleImport(item)
  const client = clientOf(item)
  const guide = IMPORT_GUIDES[client]
  const universal = buildUniversalImportURL(client, item.url)
  const encrypted = client === "loon" && /\.lpx$/i.test(httpsURL(item.url).pathname)
  const description = meta?.description || item.description
  const host = httpsURL(item.url).hostname
  const fileName = fileNameOf(item.url)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function read() {
    if (reading.current) return
    reading.current = true; setLoading(true); setReadFeedback(null)
    try {
      const next = parseModule(await loadText(item.url, 1_000_000), client)
      if (alive.current) {
        setMeta(next)
        const saved = onMetadata(item.url, next, client)
        if (!saved) setReadFeedback({ error: true, retry: false, text: "说明已读取，但未能完整保存到本机。" })
      }
    } catch (issue) {
      if (alive.current) setReadFeedback({ error: true, retry: true, text: issue instanceof Error ? issue.message : "读取失败，请重试。" })
    } finally { reading.current = false; if (alive.current) setLoading(false) }
  }
  async function copy(kind: "address" | "fallback" | "import" | "help" = "address") {
    const scope = kind === "fallback" ? "action" : kind === "import" ? "import" : kind === "help" ? "link" : "address"
    try {
      await Pasteboard.setString(kind === "import" ? buildImportURL(client, item.url, item.name) : item.url)
      if (alive.current) setFeedback({ scope, text: kind === "import" ? "已复制导入链接。" : "已复制原始网址。" })
    } catch (issue) {
      if (alive.current) setFeedback({ scope, error: true, text: issue instanceof Error ? issue.message : "复制失败，请重试。" })
    }
  }
  const notice = (scope: "action" | "address" | "import" | "link") => feedback?.scope === scope
    ? <InlineFeedback {...feedback} /> : null
  return <DetailPage kind="模块" marked={marked} onToggle={() => {
    if (onFavorite(meta ? { ...item, name: meta.name || item.name, description: meta.description || item.description } : item, !marked)) {
      setMarked(!marked)
      setFeedback({ scope: "action", text: marked ? "已取消收藏。" : "已收藏模块。" })
    }
  }}>
      <Section>
        <VStack alignment="leading" spacing={12} listRowInsets={{ top: 14, bottom: 14, leading: UI.inset, trailing: UI.inset }}>
          <DetailHero client={client} title={meta?.name || item.name} kind={guide.kind} description={description}
            byline={[meta?.author ? `作者 ${meta.author}` : "", meta?.version ? `v${meta.version}` : ""].filter(Boolean).join(" · ")} />
          <DetailAction client={client} disabled={importer.opening} title={importer.opening ? "正在打开…" : `导入到 ${clientName(client)}`}
            action={() => { setFeedback(null); void importer.install() }} accessibilityLabel={`导入 ${item.name} 到 ${clientName(client)}`} />
          {importer.feedback?.method === "native" ? <InlineFeedback {...importer.feedback} /> : null}
          {importer.feedback?.method === "native" && importer.feedback.error
            ? <Button title="复制网址手动添加" buttonStyle="borderless" tint={CLIENT_TINT[client].ink}
                frame={{ minHeight: UI.tap }} action={() => void copy("fallback")} /> : null}
          {notice("action")}
        </VStack>
        <VStack alignment="leading" spacing={UI.gap} listRowInsets={{ top: 10, bottom: 10, leading: UI.inset, trailing: UI.inset }}>
          <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}
            padding={{ horizontal: 12, vertical: 6 }}
            background={{ style: COLOR.band, shape: { type: "rect", cornerRadius: 12 } }}>
            <ParamRow label="来源" value={item.sourceNames.join(" · ")} />
            <ParamRow label="主机" value={host} mono selectable />
            <ParamRow label="文件" value={fileName} mono selectable />
          </VStack>
          <HStack spacing={UI.gap} frame={{ maxWidth: "infinity" }}>
            <Button buttonStyle="bordered" tint={CLIENT_TINT[client].ink} frame={{ maxWidth: "infinity", minHeight: UI.tap }}
              action={() => void copy()}>
              <Text font="subheadline" fontWeight="semibold" frame={{ maxWidth: "infinity" }}>复制原网址</Text>
            </Button>
            <Button buttonStyle="bordered" tint={CLIENT_TINT[client].ink} frame={{ maxWidth: "infinity", minHeight: UI.tap }}
              action={() => void copy("import")}>
              <Text font="subheadline" fontWeight="semibold" frame={{ maxWidth: "infinity" }}>复制导入链接</Text>
            </Button>
          </HStack>
          <Text font="caption" foregroundStyle={MUTED}>原网址用于粘贴；导入链接用于唤起 {clientName(client)}。</Text>
          {notice("address")}
          {notice("import")}
        </VStack>
        {encrypted ? <DetailDisclosureLabel symbol="lock.fill" title="Loon 加密插件" detail="由 Loon 解密" />
          : <DisclosureGroup label={<DetailDisclosureLabel
            title={loading ? "正在读取完整说明…" : meta || readFeedback ? "完整说明与源码" : "读取完整说明与源码"}
            detail={readFeedback?.retry ? "读取失败" : meta ? "已读取" : undefined} />}
            isExpanded={sourceExpanded}
            onChanged={expanded => {
              setSourceExpanded(expanded)
              if (expanded && !meta && !loading) void read()
            }}>
            <VStack alignment="leading" spacing={10} padding={{ vertical: UI.tight }}>
              {meta?.mitm ? <Text font="footnote" foregroundStyle={COLOR.warning.ink}>此模块包含 MITM 配置，请确认用途后再启用。</Text> : null}
              {loading && !meta ? <ProgressView title="正在读取模块…" /> : null}
              {meta ? <>
                {meta.description ? <>
                  <Text font="caption" foregroundStyle={MUTED}>完整说明</Text>
                  <Text font="footnote">{meta.description}</Text>
                </> : null}
                <Text font="caption" foregroundStyle={MUTED}>源码预览</Text>
                <Text font="footnote" fontDesign="monospaced">{meta.preview || "源码为空"}</Text>
              </> : null}
              {readFeedback ? <InlineFeedback {...readFeedback} /> : null}
              {readFeedback?.retry || meta ? <Button buttonStyle="bordered" tint={CLIENT_TINT[client].ink} disabled={loading}
                accessibilityLabel={readFeedback?.retry ? "重试读取源码" : "重新读取源码"}
                frame={{ minHeight: UI.tap }} action={() => void read()}>
                <Text>{readFeedback?.retry ? "重试读取" : "重新读取源码"}</Text>
              </Button> : null}
            </VStack>
          </DisclosureGroup>}
        <DisclosureGroup label={<DetailDisclosureLabel title="手动导入与网址" />}>
          <VStack alignment="leading" spacing={10} padding={{ vertical: UI.tight }}>
            <Text font="caption" foregroundStyle={MUTED}>原始网址</Text>
            <Text font="footnote" fontDesign="monospaced" foregroundStyle={MUTED} textSelection>{item.url}</Text>
            <Text font="caption" foregroundStyle={MUTED}>导入说明</Text>
            <Text font="footnote" foregroundStyle={MUTED}>{guide.note}</Text>
            <Text font="footnote" foregroundStyle={MUTED}>{guide.manual}</Text>
            {universal ? <Button title="通过官方链接导入" buttonStyle="borderless" tint={CLIENT_TINT[client].ink}
              disabled={importer.opening} frame={{ minHeight: UI.tap }} action={() => { setFeedback(null); void importer.install("universal") }} /> : null}
            {universal && importer.feedback?.method === "universal" ? <InlineFeedback {...importer.feedback} /> : null}
            {universal && importer.feedback?.method === "universal" && importer.feedback.error
              ? <Button title="复制模块网址" buttonStyle="borderless" tint={CLIENT_TINT[client].ink} frame={{ minHeight: UI.tap }} action={() => void copy("help")} /> : null}
            {notice("link")}
            {universal ? <Text font="footnote" foregroundStyle={MUTED}>此入口会将模块网址交给该软件的官方链接服务。</Text> : null}
          </VStack>
        </DisclosureGroup>
      </Section>
  </DetailPage>
}

export function RuleDetail({ item, favorite, onFavorite, loadText }: {
  loadText: GetText
  item: CatalogueItem; favorite: boolean; onFavorite: (item: CatalogueItem, marked: boolean) => boolean
}) {
  const client = clientOf(item)
  const page = magicRulePage(item)
  const [marked, setMarked] = useState(favorite)
  const [files, setFiles] = useState<RuleFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(""); setFiles([])
    ruleFiles(item, loadText).then(result => { if (active) setFiles(result) })
      .catch(issue => { if (active) setError(issue instanceof Error ? issue.message : "读取规则文件失败。") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [item.url, attempt])
  async function copy(file: RuleFile) {
    await Pasteboard.setString(file.url)
    setCopied(file.url)
  }
  const primary = files[0] // ruleFiles puts recommended artifacts first.
  const ruleCount = item.rule?.lines
  return <DetailPage kind="规则集" marked={marked} onToggle={() => {
    if (onFavorite(item, !marked)) setMarked(!marked)
  }}>
    <Section>
      <VStack alignment="leading" spacing={12} listRowInsets={{ top: 14, bottom: 14, leading: UI.inset, trailing: UI.inset }}>
        <DetailHero client={client} kind="规则集" title={item.name} description={item.description}
          byline={ruleCount === undefined ? undefined : `共 ${formatCount(ruleCount)} 条规则`} />
        {loading ? <ProgressView title="正在读取规则文件…" /> : error ? <>
          <InlineFeedback text={error} error />
          <DetailAction client={client} title="重试读取规则文件" action={() => setAttempt(value => value + 1)} />
        </> : primary ? <DetailAction client={client}
          title={copied === primary.url ? "已复制规则地址" : primary.recommended ? "复制推荐规则地址" : "复制规则地址"}
          action={() => void copy(primary).catch(failure)} /> : <Text foregroundStyle={MUTED}>此规则暂未发布可用文件。</Text>}
      </VStack>
      <VStack alignment="leading" spacing={0} listRowInsets={{ top: 10, bottom: 10, leading: UI.inset, trailing: UI.inset }}>
        <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}
          padding={{ horizontal: 12, vertical: 6 }} background={{ style: COLOR.band, shape: { type: "rect", cornerRadius: 12 } }}>
          <ParamRow label="来源" value={item.sourceNames.join(" · ")} />
          <ParamRow label="主机" value={httpsURL(item.url).hostname} mono selectable />
          <ParamRow label="规则类型" value={item.rule?.types.join(" · ")} selectable />
        </VStack>
      </VStack>
      {files.length ? <DisclosureGroup label={<DetailDisclosureLabel title="规则文件" detail={`${formatCount(files.length)} 个文件`} />}>
        {files.map(file => <HStack key={file.url} spacing={UI.gap}>
          <Text font="subheadline">{file.label}{file.recommended ? " · 推荐" : ""}</Text><Spacer />
          <Button title={copied === file.url ? "已复制" : "复制地址"} buttonStyle="bordered" tint={CLIENT_TINT[client].ink}
            accessibilityLabel={`复制${file.label}地址`} frame={{ minHeight: UI.tap }} action={() => void copy(file).catch(failure)} />
        </HStack>)}
      </DisclosureGroup> : null}
      <Link url={page} accessibilityLabel="在 MagicRule 查看订阅选项">
        <HStack spacing={UI.gap} frame={{ maxWidth: "infinity", minHeight: UI.tap }}>
          <Text foregroundStyle={INK}>在 MagicRule 查看订阅选项</Text><Spacer />
          <Image systemName="arrow.up.right" font="footnote" foregroundStyle={MUTED} accessibilityHidden />
        </HStack>
      </Link>
    </Section>
  </DetailPage>
}

function DetailDisclosureLabel({ symbol, title, detail }: { symbol?: string; title: string; detail?: string }) {
  return <HStack spacing={12} frame={{ minHeight: UI.tap, maxWidth: "infinity", alignment: "leading" }} contentShape="rect">
    {symbol ? <Image systemName={symbol} font="body" foregroundStyle={ACCENT} accessibilityHidden /> : null}
    <Text font="body" lineLimit={1}>{title}</Text>
    <Spacer minLength={UI.tight} />
    {detail ? <Text font="footnote" foregroundStyle={MUTED}>{detail}</Text> : null}
  </HStack>
}
