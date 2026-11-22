import {
  List, Section, ForEach, Text, HStack, VStack, Spacer, Image, Button, Toolbar, ToolbarItem, Picker,
} from "scripting"
import { TokiState, Identity, Account, Token, ACCOUNT_CATEGORIES, TOKEN_CATEGORIES, TokiSettings } from "./types"
import { mask, maskName, expiryLabel, copyText } from "./components"

const kindMeta: Record<Identity["type"], { title: string; icon: string }> = {
  email: { title: "邮箱", icon: "envelope" },
  phone: { title: "手机号", icon: "phone" },
  login: { title: "登录账号", icon: "person.crop.circle" },
}

// ---------------- 卡包 ----------------
export function WalletPage({ state, settings, onAdd, onEdit, onCopy }: {
  state: TokiState; settings: TokiSettings
  onAdd: () => void; onEdit: (i: Identity) => void; onCopy: (v: string) => void
}) {
  const p = settings.privacy
  return (
    <List
      navigationTitle="卡包"
      listStyle="insetGrouped"
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="添加" systemImage="plus" action={onAdd} /></ToolbarItem></Toolbar>}
    >
      <Section title="概览">
        <HStack>
          <Image systemName="wallet.pass" foregroundStyle="accentColor" />
          <Text>{state.identities.length} 个身份 · {state.accounts.length} 个网站</Text>
        </HStack>
      </Section>
      {(["email", "phone", "login"] as Identity["type"][]).map(k => {
        const items = state.identities.filter(i => i.type === k)
        if (!items.length) return null
        return (
          <Section title={kindMeta[k].title} key={k}>
            <ForEach count={items.length} itemBuilder={(idx: number) => {
              const it = items[idx]
              return (
                <HStack spacing={10}>
                  <Image systemName={kindMeta[k].icon} foregroundStyle={it.color} />
                  <VStack alignment="leading" spacing={2}>
                    <Text bold lineLimit={1}>{it.label || kindMeta[k].title}</Text>
                    <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1} monospaced>{maskName(it.value, p)}</Text>
                    {it.notes ? <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>{it.notes}</Text> : null}
                  </VStack>
                  <Spacer />
                  <Button title="" systemImage="doc.on.doc" action={() => onCopy(it.value)} />
                  <Button title="" systemImage="square.and.pencil" action={() => onEdit(it)} />
                </HStack>
              )
            }} />
          </Section>
        )
      })}
    </List>
  )
}

// ---------------- 网站与 App ----------------
export function SitesPage({ state, filter, onFilter, onAdd, onEdit }: {
  state: TokiState; filter: string; onFilter: (c: string) => void
  onAdd: () => void; onEdit: (a: Account) => void
}) {
  const counts: Record<string, number> = {}
  state.accounts.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1 })
  const cats = ACCOUNT_CATEGORIES.filter(c => counts[c])
  const shown = filter === "全部" ? state.accounts : state.accounts.filter(a => a.category === filter)
  const idName = (id: string) => {
    const i = state.identities.find(x => x.id === id)
    return i ? (i.label || i.value) : ""
  }
  return (
    <List
      navigationTitle="网站与 App"
      listStyle="insetGrouped"
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="添加" systemImage="plus" action={onAdd} /></ToolbarItem></Toolbar>}
    >
      <Section title="分类筛选">
        <Picker title="分类" value={filter} onChanged={onFilter}>
          <Text tag="全部" key="all">全部（{state.accounts.length}）</Text>
          {cats.map(c => <Text tag={c} key={c}>{c}（{counts[c]}）</Text>)}
        </Picker>
      </Section>
      {shown.length === 0 ? (
        <Section><Text foregroundStyle="secondaryLabel">这里还没有网站。点右上角 + 添加，或从网页版导入。</Text></Section>
      ) : (
        <Section title={filter === "全部" ? "全部网站" : filter}>
          <ForEach count={shown.length} itemBuilder={(idx: number) => {
            const a = shown[idx]
            return (
              <HStack spacing={10}>
                <Image systemName="globe" foregroundStyle="accentColor" />
                <VStack alignment="leading" spacing={2}>
                  <Text bold lineLimit={1}>{a.name}</Text>
                  <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{a.domain || a.handle || ""}</Text>
                  <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
                    {a.identityIds.map(idName).filter(Boolean).join(" · ") || "未关联身份"}
                  </Text>
                </VStack>
                <Spacer />
                <Button title="" systemImage="square.and.pencil" action={() => onEdit(a)} />
              </HStack>
            )
          }} />
        </Section>
      )}
    </List>
  )
}

// ---------------- Tokens ----------------
export function TokensPage({ state, filter, onFilter, revealed, onAdd, onEdit, onCopy, onToggleReveal }: {
  state: TokiState; filter: string; onFilter: (c: string) => void; revealed: Set<string>
  onAdd: () => void; onEdit: (t: Token) => void; onCopy: (v: string) => void; onToggleReveal: (id: string) => void
}) {
  const counts: Record<string, number> = {}
  state.tokens.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1 })
  const cats = TOKEN_CATEGORIES.filter(c => counts[c])
  const all = state.tokens.slice().sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity))
  const shown = filter === "全部" ? all : all.filter(t => t.category === filter)
  return (
    <List
      navigationTitle="Tokens"
      listStyle="insetGrouped"
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="添加" systemImage="plus" action={onAdd} /></ToolbarItem></Toolbar>}
    >
      <Section title="概览">
        <HStack>
          <Image systemName="key.fill" foregroundStyle="accentColor" />
          <Text>{all.length} 条密钥</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">{all.filter(t => expiryLabel(t.expiresAt).urgent).length} 条需留意</Text>
        </HStack>
      </Section>
      <Section title="分类筛选">
        <Picker title="分类" value={filter} onChanged={onFilter}>
          <Text tag="全部" key="all">全部（{all.length}）</Text>
          {cats.map(c => <Text tag={c} key={c}>{c}（{counts[c]}）</Text>)}
        </Picker>
      </Section>
      {shown.length === 0 ? (
        <Section><Text foregroundStyle="secondaryLabel">还没有密钥。点右上角 + 添加。</Text></Section>
      ) : (
        <Section title={filter === "全部" ? "全部密钥" : filter}>
          <ForEach count={shown.length} itemBuilder={(idx: number) => {
            const t = shown[idx]
            const ex = expiryLabel(t.expiresAt)
            const shownValue = revealed.has(t.id)
            return (
              <HStack spacing={10}>
                <Image systemName="key.fill" foregroundStyle={ex.urgent ? "systemOrange" : t.color} />
                <VStack alignment="leading" spacing={2}>
                  <Text bold lineLimit={1}>{t.name}</Text>
                  <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1} monospaced={shownValue}>
                    {shownValue ? t.value : mask(t.value)}
                  </Text>
                  <Text font="caption2" foregroundStyle={ex.urgent ? "systemOrange" : "tertiaryLabel"}>{ex.text}</Text>
                </VStack>
                <Spacer />
                <Button title="" systemImage={shownValue ? "eye.slash" : "eye"} action={() => onToggleReveal(t.id)} />
                <Button title="" systemImage="doc.on.doc" action={() => onCopy(t.value)} />
                <Button title="" systemImage="square.and.pencil" action={() => onEdit(t)} />
              </HStack>
            )
          }} />
        </Section>
      )}
    </List>
  )
}

// ---------------- 关系图（列表式） ----------------
export function GraphPage({ state, onOpenSite }: { state: TokiState; onOpenSite: (a: Account) => void }) {
  return (
    <List navigationTitle="关系图" listStyle="insetGrouped">
      <Section title="说明">
        <Text font="caption" foregroundStyle="secondaryLabel">每个身份关联了哪些网站。可视化连线图请见网页版。</Text>
      </Section>
      {state.identities.map(id => {
        const linked = state.accounts.filter(a => a.identityIds.includes(id.id))
        return (
          <Section title={id.label || id.value} key={id.id}>
            {linked.length === 0 ? (
              <Text font="caption" foregroundStyle="tertiaryLabel">暂无关联网站</Text>
            ) : linked.map(a => (
              <HStack key={a.id}>
                <Image systemName="link" foregroundStyle="accentColor" />
                <Text lineLimit={1}>{a.name}</Text>
                <Spacer />
                <Button title="" systemImage="square.and.pencil" action={() => onOpenSite(a)} />
              </HStack>
            ))}
          </Section>
        )
      })}
    </List>
  )
}
