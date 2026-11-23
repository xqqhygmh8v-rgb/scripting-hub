import {
  Button, HStack, Image, List,
  NavigationStack, ProgressView, RoundedRectangle, ScrollView, Section,
  Spacer, Text, VStack, ZStack, useCallback,
  useEffect, useMemo, useObservable, useRef, useState,
} from "scripting"
import type { CatalogueItem, Source } from "./core"
import { favoriteSourceOptions, filterItems, magicRulePage } from "./core"
import type { Client } from "./clients"
import { CLIENTS, clientName, clientOf, isClient, moduleKey } from "./clients"
import { CLIENT_TINT } from "./client-colors"
import type { Feedback } from "./ui"
import {
  ACCENT, CLIENT_SPECTRUM, COLOR, FAVORITE, FILTER_VISIBLE_ROWS,
  INITIAL_MODULE_COUNT, INK, MUTED, UI, ClientIcon,
  EmptyState, InlineFeedback, failure, formatCount,
} from "./ui"
import { useModuleImport } from "./useModuleImport"

type Filters = { client: Client | ""; source: string }

type FilterOption = { id: string; name: string; count: number; client?: Client }

function FilterOptionRow({ option, selected, onChoose }: {
  option: FilterOption; selected: boolean; onChoose: (id: string) => void
}) {
  const ink = option.client ? CLIENT_TINT[option.client].ink : ACCENT
  const soft = option.client ? CLIENT_TINT[option.client].soft : COLOR.accentFill
  const label = `${option.name} · ${formatCount(option.count)}`
  return <Button buttonStyle="plain" accessibilityLabel={label}
    accessibilityAddTraits={selected ? "isSelected" : undefined} action={() => onChoose(option.id)}>
    <HStack spacing={UI.gap} padding={{ horizontal: 8, vertical: 5 }}
      frame={{ maxWidth: "infinity", minHeight: UI.tap }} contentShape="rect"
      background={{ style: selected ? soft : COLOR.band, shape: { type: "rect", cornerRadius: 10 } }}
      overlay={<RoundedRectangle cornerRadius={10}
        stroke={{ shapeStyle: selected ? ink : COLOR.line, strokeStyle: { lineWidth: selected ? 1.2 : 0.6 } }} />}>
      {option.client ? <ClientIcon client={option.client} />
        : <Image systemName="square.stack.3d.up" font="body" foregroundStyle={ink} accessibilityHidden />}
      <Text font="body" fontWeight={selected ? "semibold" : "regular"}
        foregroundStyle={selected ? ink : INK} multilineTextAlignment="leading"
        lineLimit={1} truncationMode="tail">{option.name}</Text>
      <Spacer minLength={UI.gap} />
      <Text font="footnote" foregroundStyle={selected ? ink : MUTED} fixedSize>{formatCount(option.count)}</Text>
      {selected ? <Image systemName="checkmark.circle.fill" font="headline" foregroundStyle={ink} fixedSize accessibilityHidden /> : null}
    </HStack>
  </Button>
}

function FilterChoices({ options, selectedId, onChoose }: {
  options: FilterOption[]; selectedId: string; onChoose: (id: string) => void
}) {
  const allSources = options.find(option => !option.id)
  const groups = CLIENTS.map(client => ({
    client,
    options: options.filter(option => option.id && option.client === client.id),
  })).filter(group => group.options.length > 0)
  const content = <VStack alignment="leading" spacing={8} frame={{ maxWidth: "infinity" }}>
    {allSources ? <FilterOptionRow option={allSources} selected={selectedId === ""} onChoose={onChoose} /> : null}
    {groups.map(group => <VStack key={group.client.id} alignment="leading" spacing={4}>
      <HStack spacing={UI.tight} padding={{ horizontal: 8, top: 4 }}>
        <ClientIcon client={group.client.id} />
        <Text font="caption" fontWeight="semibold" foregroundStyle={CLIENT_TINT[group.client.id].ink}
          lineLimit={1} truncationMode="tail">
          {group.client.name}
        </Text>
      </HStack>
      {group.options.map(option => <FilterOptionRow key={option.id} option={option}
        selected={selectedId === option.id} onChoose={onChoose} />)}
    </VStack>)}
  </VStack>
  // Keep short menus at their natural height; cap long lists at twelve source rows.
  if (options.length <= FILTER_VISIBLE_ROWS) return content
  return <ScrollView frame={{ height: FILTER_VISIBLE_ROWS * UI.tap }}>{content}</ScrollView>
}

function FilterPanel({ sources, filters, onChooseSource, onReset, onClose }: {
  sources: FilterOption[]; filters: Filters
  onChooseSource: (id: string) => void; onReset: () => void; onClose: () => void
}) {
  return <VStack spacing={UI.tight} padding={12} frame={{ width: 276 }}>
    <VStack alignment="leading" spacing={2} padding={{ horizontal: 8, vertical: 4 }}>
      <Text font="subheadline" fontWeight="semibold" lineLimit={1} truncationMode="tail">按来源筛选</Text>
      <Text font="caption" foregroundStyle={MUTED} lineLimit={1} truncationMode="tail">
        选择一个来源，只显示其中的模块
      </Text>
    </VStack>
    <FilterChoices options={sources} selectedId={filters.source} onChoose={onChooseSource} />
    <HStack spacing={UI.gap} frame={{ maxWidth: "infinity" }}>
      {filters.source ? <Button title="清除来源筛选" buttonStyle="borderless" tint={ACCENT}
        frame={{ maxWidth: "infinity", minHeight: UI.tap }} action={onReset} /> : null}
      <Button title="完成" buttonStyle="borderedProminent" tint={ACCENT}
        frame={{ maxWidth: "infinity", minHeight: UI.tap }} action={onClose} />
    </HStack>
  </VStack>
}

// Owns the popover state so opening the filter never re-renders the module list behind it.
function FilterMenu({ scope, sources, filters, onChooseSource, onReset }: {
  scope: string; sources: FilterOption[]; filters: Filters
  onChooseSource: (id: string) => void; onReset: () => void
}) {
  const open = useObservable(false)
  const filtered = !!(filters.client || filters.source)
  const content = useMemo(() => <FilterPanel filters={filters} sources={sources}
    onChooseSource={onChooseSource}
    onReset={onReset} onClose={() => open.setValue(false)} />,
    [sources, filters, onChooseSource, onReset])
  return <Button key="filter" accessibilityLabel={`筛选模块，当前 ${scope}`} action={() => open.setValue(true)}
    popover={{ isPresented: open, presentationCompactAdaptation: "popover", content }}>
    <HStack spacing={UI.tight}>
      <Image systemName={filtered ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle"}
        font="body" foregroundStyle={filtered ? ACCENT : INK} accessibilityHidden />
      <Text font="subheadline" foregroundStyle={filtered ? ACCENT : INK}>筛选</Text>
    </HStack>
  </Button>
}

// Quick client filters stay visible above the catalogue; the toolbar popover
// only narrows results by source, avoiding duplicate software controls.
function QuickClientFilters({ options, selected, onChoose }: {
  options: FilterOption[]; selected: Client | ""; onChoose: (client: Client | "") => void
}) {
  return <ScrollView axes="horizontal">
    <HStack spacing={8} padding={{ vertical: 3 }}>
      {options.map(option => {
        const client = isClient(option.id) ? option.id : undefined
        const active = selected === option.id
        const ink = client ? CLIENT_TINT[client].ink : ACCENT
        const fill = active ? (client ? CLIENT_TINT[client].soft : COLOR.accentFill) : COLOR.band
        return <Button key={option.id || "all"} buttonStyle="plain"
          accessibilityLabel={`${option.name}，${formatCount(option.count)} 个`}
          accessibilityAddTraits={active ? "isSelected" : undefined}
          action={() => onChoose(client ?? "")}>
          <HStack spacing={6} padding={{ horizontal: 10, vertical: 6 }}
            background={{ style: fill, shape: { type: "rect", cornerRadius: 9 } }}
            overlay={<RoundedRectangle cornerRadius={9}
              stroke={{ shapeStyle: active ? (client ? CLIENT_TINT[client].ink : ACCENT) : COLOR.line,
                strokeStyle: { lineWidth: active ? 1.5 : 0.6 } }} />}>
            {client ? <ClientIcon client={client} />
              : <ZStack frame={{ width: UI.clientIcon, height: UI.clientIcon }}
                  background={active ? COLOR.accentFill : COLOR.band} clipShape="circle">
                  <Image systemName="square.grid.2x2" font="caption" foregroundStyle={ink} accessibilityHidden />
                </ZStack>}
            <Text font="footnote" fontWeight={active ? "semibold" : "medium"}
              foregroundStyle={active ? ink : MUTED} lineLimit={1} fixedSize>{option.id ? option.name : "全部"}</Text>
            <Text font="caption2" foregroundStyle={active ? ink : MUTED} fixedSize>{formatCount(option.count)}</Text>
          </HStack>
        </Button>
      })}
    </HStack>
  </ScrollView>
}

type BrowserProps = {
  onlyFavorites: boolean; sources: Source[]; all: CatalogueItem[]; favoriteKeys: Set<string>; busy: boolean
  progress: { done: number; total: number }; message: Feedback | null; onDetail: (item: CatalogueItem) => Promise<void>
  onFavorite: (item: CatalogueItem, marked: boolean) => boolean
  onRefresh: () => Promise<void>; onSources: () => void; onBrowse: () => void; onClose: () => void
}

function ModuleRow({ item, marked, onDetail, onFavorite }: {
  item: CatalogueItem; marked: boolean; onDetail: (item: CatalogueItem) => Promise<void>
  onFavorite: (item: CatalogueItem, marked: boolean) => boolean
}) {
  const importer = useModuleImport(item)
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)
  const client = clientOf(item)
  const software = clientName(client)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => { if (alive.current) setCopied(false) }, 2000)
    return () => clearTimeout(timer)
  }, [copied])
  function install() { setCopied(false); void importer.install() }
  async function copy() {
    await Pasteboard.setString(item.rule ? magicRulePage(item) : item.url)
    if (alive.current) setCopied(true)
  }
  return <VStack alignment="leading" spacing={UI.tight} listRowInsets={{ top: 6, bottom: 6, leading: UI.inset, trailing: UI.inset }}
    trailingSwipeActions={{
      allowsFullSwipe: false,
      actions: [
        <Button key="favorite" title={marked ? "取消收藏" : "收藏"} tint={CLIENT_TINT[client].solid}
          action={() => onFavorite(item, !marked)} />,
        <Button key="copy" title={item.rule ? "复制规则页" : "复制"} tint={ACCENT} action={() => void copy().catch(failure)} />,
      ],
    }}>
    <HStack alignment="center" spacing={8}>
      <Button buttonStyle="borderless" accessibilityLabel={`${item.name}，${software}${marked ? "，已收藏" : ""}`}
        accessibilityHint={item.rule ? "查看规则集详情" : "查看模块详情"} action={() => void onDetail(item).catch(failure)}>
        <HStack spacing={12} frame={{ minHeight: UI.tap, maxWidth: "infinity", alignment: "leading" }}
          contentShape="rect">
          <ClientIcon client={client} />
          <VStack alignment="leading" spacing={UI.tight} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text font="body" fontWeight="medium" foregroundStyle={INK} lineLimit={1} truncationMode="tail">{item.name}</Text>
            <HStack spacing={4}>
              <Text font="footnote" fontWeight="semibold" foregroundStyle={CLIENT_TINT[client].ink}>{software}</Text>
              {item.sourceNames.length ? <Text font="footnote" foregroundStyle={MUTED} lineLimit={1}>{`· ${item.sourceNames[0]}${item.sourceNames.length > 1 ? ` +${item.sourceNames.length - 1}` : ""}`}</Text> : null}
            </HStack>
            {item.description ? <Text font="footnote" foregroundStyle={MUTED} lineLimit={1}>{item.description}</Text> : null}
            {item.rule ? <Text font="caption" foregroundStyle={MUTED} lineLimit={2}>{[
              item.rule.lines === undefined ? "" : `${formatCount(item.rule.lines)} 条`, ...item.rule.types,
            ].filter(Boolean).join(" · ")}</Text> : null}
          </VStack>
        </HStack>
      </Button>
      <Button buttonStyle="borderless"
        title={marked ? "取消收藏" : "收藏"} systemImage={marked ? "star.fill" : "star"}
        labelStyle="iconOnly" tint={marked ? FAVORITE : MUTED}
        accessibilityLabel={`${marked ? "取消收藏" : "收藏"}${item.name}`}
        frame={{ width: UI.tap, height: UI.tap }} action={() => onFavorite(item, !marked)}
        background={COLOR.band} clipShape="circle" />
      <Button buttonStyle="borderless" disabled={importer.opening} accessibilityLabel={item.rule ? `查看 ${item.name} 的规则文件` : `导入 ${item.name} 到 ${software}`}
        action={item.rule ? () => void onDetail(item).catch(failure) : install}>
        <VStack frame={{ width: UI.tap, height: UI.tap }} contentShape="rect">
          <HStack spacing={0} padding={{ horizontal: 0 }} frame={{ width: 36, height: 36 }}
            alignment="center"
            background={{ style: CLIENT_TINT[client].soft, shape: { type: "rect", cornerRadius: 18 } }}>
            {importer.opening ? <ProgressView accessibilityLabel="正在打开导入页" />
              : <><Image systemName={item.rule ? "doc.text" : "arrow.down.to.line"} font="body"
                  foregroundStyle={CLIENT_TINT[client].ink} accessibilityHidden />
                </>}
          </HStack>
        </VStack>
      </Button>
    </HStack>
    {importer.feedback ? <InlineFeedback {...importer.feedback} /> : null}
    {copied && !importer.feedback?.error ? <InlineFeedback text="已复制网址。" /> : null}
    {importer.feedback?.error ? <Button title={copied ? "网址已复制" : "复制网址手动添加"} buttonStyle="borderless"
      disabled={copied} frame={{ minHeight: UI.tap }} action={() => void copy().catch(failure)} /> : null}
  </VStack>
}

export function ModuleBrowser({ onlyFavorites, sources, all, favoriteKeys, busy, progress, message: syncMessage, onDetail, onFavorite, onRefresh, onSources, onBrowse, onClose }: BrowserProps) {
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Filters>({ client: "", source: "" })
  const [pageSize, setPageSize] = useState<number>(INITIAL_MODULE_COUNT)
  const base = useMemo(() => filterItems(all, query, "", favoriteKeys, onlyFavorites), [all, query, favoriteKeys, onlyFavorites])
  const counts = useMemo(() => {
    const byClient = new Map<Client, number>(), bySource = new Map<string, number>()
    for (const item of base) {
      const client = clientOf(item)
      byClient.set(client, (byClient.get(client) ?? 0) + 1)
      for (const id of item.sourceIds) bySource.set(id, (bySource.get(id) ?? 0) + 1)
    }
    return { byClient, bySource }
  }, [base])
  const choices = useMemo(() => onlyFavorites ? favoriteSourceOptions(all, sources, filters.client)
    : sources.filter(item => item.enabled && (!filters.client || clientOf(item) === filters.client)), [onlyFavorites, all, sources, filters.client])
  const selectedSource = choices.some(item => item.id === filters.source) ? filters.source : ""
  const visible = useMemo(() => base.filter(item => (!filters.client || clientOf(item) === filters.client) &&
    (!selectedSource || item.sourceIds.includes(selectedSource))), [base, filters.client, selectedSource])
  const filtered = !!(filters.client || selectedSource)
  useEffect(() => { setPageSize(INITIAL_MODULE_COUNT) }, [query, selectedSource, filters.client])
  useEffect(() => {
    if (filters.source && !selectedSource) setFilters(previous => ({ ...previous, source: "" }))
  }, [filters.source, selectedSource])
  const chooseClient = useCallback((client: Client | "") => {
    setFilters(previous => {
      const options = onlyFavorites ? favoriteSourceOptions(all, sources, client) : sources.filter(source => source.enabled && (!client || clientOf(source) === client))
      return { client, source: options.some(source => source.id === previous.source) ? previous.source : "" }
    })
  }, [sources, all, onlyFavorites])
  const chooseSource = useCallback((source: string) => { setFilters(previous => ({ ...previous, source })) }, [])
  function clear() { setQuery(""); setFilters({ client: "", source: "" }) }
  const resetSourceFilter = useCallback(() => { setFilters(previous => ({ ...previous, source: "" })) }, [])
  const hasQuery = !!query.trim()
  const unit = useMemo(() => visible.some(item => item.rule) ? (visible.every(item => item.rule) ? "规则集" : "条目") : "模块", [visible])
  const searching = hasQuery || filtered
  const clearTitle = filtered && hasQuery ? "清除搜索与筛选" : filtered ? "重置筛选" : "清除搜索"
  const result = busy && !all.length ? `读取来源 ${progress.done}/${progress.total}`
    : `${formatCount(visible.length)} 个${onlyFavorites ? "收藏" : unit}`
  const clientChoice = filters.client ? CLIENTS.find(client => client.id === filters.client)?.name ?? "全部软件" : "全部软件"
  const sourceChoice = choices.find(source => source.id === selectedSource)?.name ?? "全部来源"
  const scope = filtered ? [clientChoice, selectedSource ? sourceChoice : ""].filter(Boolean).join(" / ") : "全部软件与来源"
  const matching = filters.client ? counts.byClient.get(filters.client) ?? 0 : base.length
  const nextBatch = Math.min(UI.batch, visible.length - pageSize)
  // Reuse row elements so refresh progress and unchanged source entries do not
  // rebuild the first 200 rows. The catalogue array is recreated when one source
  // finishes, so use the displayed fields as the cache version instead of object
  // identity. A changed title, description, source label or rule summary still
  // gets a fresh row immediately.
  const rowCache = useRef(new Map<string, { version: string; marked: boolean; node: any }>())
  const rows = useMemo(() => visible.slice(0, pageSize).map(item => {
    const key = moduleKey(item)
    const marked = favoriteKeys.has(key)
    const version = [item.url, item.name, item.description, item.sourceIds.join("\u0000"), item.sourceNames.join("\u0000"),
      item.rule?.lines ?? "", item.rule?.types.join("\u0000") ?? ""].join("\u0001")
    const cached = rowCache.current.get(key)
    if (cached && cached.version === version && cached.marked === marked) return cached.node
    const node = <ModuleRow key={key} item={item} marked={marked} onDetail={onDetail} onFavorite={onFavorite} />
    rowCache.current.set(key, { version, marked, node })
    if (rowCache.current.size > 4096) rowCache.current.clear()
    return node
  }), [visible, pageSize, favoriteKeys, onDetail, onFavorite])
  // Keep the popover's inputs referentially stable so re-rendering this list
  // never rebuilds the panel that is currently on screen.
  const filterValue = useMemo<Filters>(() => ({ client: filters.client, source: selectedSource }), [filters.client, selectedSource])
  const filterClients = useMemo<FilterOption[]>(() => [
    { id: "", name: "全部软件", count: base.length },
    ...CLIENTS.map(client => ({ id: client.id, name: client.name, count: counts.byClient.get(client.id) ?? 0 })),
  ], [base.length, counts])
  const filterSources = useMemo<FilterOption[]>(() => [
    { id: "", name: "全部来源", count: matching },
    ...choices.map(source => ({ id: source.id, name: source.name, count: counts.bySource.get(source.id) ?? 0,
      client: clientOf(source) })),
  ], [matching, choices, counts])
  const refreshIssue = !onlyFavorites && (syncMessage?.error || syncMessage?.warning) ? syncMessage : null
  const loadFailed = !all.length && refreshIssue !== null
  const emptyTitle = loadFailed ? "没有可用的模块" : searching ? "没有匹配的模块" : onlyFavorites ? "还没有可用的收藏" : "还没有模块"
  const empty = loadFailed ? refreshIssue.text : searching ? "换个关键词，或清除搜索与筛选。"
    : onlyFavorites ? "打开任意模块的详情，点星标即可收藏。" : "添加来源后，模块会显示在这里。"
  const summary = filtered ? `${result} · ${scope}` : result
  return <NavigationStack>
    <List listStyle="plain" foregroundStyle={INK} frame={{ maxWidth: UI.detailWidth }}
      navigationTitle={onlyFavorites ? "收藏" : "模块"} navigationBarTitleDisplayMode="inline"
      refreshable={onRefresh}
      searchable={{ value: query, onChanged: setQuery, prompt: onlyFavorites ? "搜索收藏" : "搜索模块、规则集或来源", placement: "navigationBarDrawerAlwaysDisplay" }}
      toolbar={{ cancellationAction: <Button title="关闭" action={onClose} />,
        topBarTrailing: <FilterMenu scope={scope}
          filters={filterValue} sources={filterSources}
          onChooseSource={chooseSource} onReset={resetSourceFilter} /> }}>
      <Section listRowSeparator="hidden">
        <QuickClientFilters options={filterClients} selected={filters.client} onChoose={chooseClient} />
      </Section>
      <Section header={<VStack alignment="leading" spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={UI.tight}>
          {busy ? <ProgressView accessibilityHidden /> : null}
          <Text lineLimit={1}>{summary}</Text>
        </HStack>
        <ZStack frame={{ height: 4, maxWidth: "infinity" }} background={CLIENT_SPECTRUM}
          clipShape="capsule" accessibilityHidden />
      </VStack>}>
          {refreshIssue && !loadFailed ? <VStack alignment="leading" spacing={UI.tight}>
            <InlineFeedback {...refreshIssue} />
            <Button title="查看来源" buttonStyle="borderless" tint={ACCENT} frame={{ minHeight: UI.tap }} action={onSources} />
          </VStack> : null}
          {rows}
          {!visible.length && !(busy && !all.length) ? <EmptyState
            symbol={loadFailed ? "exclamationmark.triangle" : searching ? "magnifyingglass" : onlyFavorites ? "star" : "tray"}
            title={emptyTitle} message={empty}
            action={loadFailed ? "查看来源状态" : searching ? clearTitle : onlyFavorites ? "浏览模块" : "前往来源"}
            onAction={loadFailed ? onSources : searching ? clear : onlyFavorites ? onBrowse : onSources} /> : null}
      </Section>
      {nextBatch > 0 ? <Section>
        <HStack spacing={UI.gap} frame={{ maxWidth: "infinity" }} listRowSeparator="hidden"
          padding={{ vertical: 4 }}>
          <Text font="subheadline" foregroundStyle={MUTED} lineLimit={1}>
            已显示 {formatCount(pageSize)} / {formatCount(visible.length)}
          </Text>
          <Spacer minLength={UI.tight} />
          <Button buttonStyle="bordered" tint={ACCENT}
            accessibilityLabel={`再显示 ${nextBatch} 个${unit}`}
            action={() => setPageSize(value => value + UI.batch)}>
            <Text font="body" fontWeight="semibold">再显示 {nextBatch} 个</Text>
          </Button>
        </HStack>
      </Section> : visible.length ? <Section>
        <Text font="caption" foregroundStyle={MUTED} listRowSeparator="hidden"
          frame={{ maxWidth: "infinity", alignment: "center" }} padding={{ vertical: 6 }}>
          已显示全部 {formatCount(visible.length)} 个
        </Text>
      </Section> : null}
    </List>
  </NavigationStack>
}
