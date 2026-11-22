import {
  Form, TextField, SecureField, Picker, DatePicker, Button, Toolbar, ToolbarItem, Toggle,
  HStack, VStack, Text, Image, Spacer, Section, Pasteboard,
} from "scripting"
import {
  Token, Identity, Account, TOKEN_CATEGORIES, ACCOUNT_CATEGORIES, uid, IdentityType,
} from "./types"
import { TOKEN_PRESETS, SITE_PRESETS, IDENTITY_COLORS, Preset } from "./presets"

export function mask(s: string): string {
  const v = String(s || "")
  if (v.length <= 8) return "••••••••"
  return v.slice(0, 4) + "••••••••" + v.slice(-4)
}
export function maskName(s: string, privacy = false): string {
  const v = String(s || "")
  if (privacy) return v.length <= 2 ? v + "••" : v.slice(0, 2) + "•••" + v.slice(-1)
  return v
}
export function expiryLabel(expiresAt: number): { text: string; urgent: boolean } {
  if (!expiresAt) return { text: "不过期", urgent: false }
  const d = expiresAt - Date.now()
  if (d < 0) return { text: "已过期", urgent: true }
  if (d < 7 * 86400000) return { text: `${Math.ceil(d / 86400000)} 天后到期`, urgent: true }
  return { text: new Date(expiresAt).toLocaleDateString("zh-CN"), urgent: false }
}
export function copyText(value: string) { Pasteboard.setString(value) }

// ---------------- drafts ----------------
export type DraftToken = {
  id: string; name: string; domain: string; category: string; color: string
  value: string; notes: string; expiryTs: number
}
export const emptyTokenDraft = (): DraftToken => ({
  id: "", name: "", domain: "", category: TOKEN_CATEGORIES[0], color: "#0A84FF",
  value: "", notes: "", expiryTs: 0,
})
export const tokenDraft = (t: Token): DraftToken => ({
  id: t.id, name: t.name, domain: t.domain, category: t.category, color: t.color,
  value: t.value, notes: t.notes || "", expiryTs: t.expiresAt || 0,
})
export const draftToToken = (d: DraftToken): Token => {
  const now = Date.now()
  return {
    id: d.id || uid(), name: d.name || "未命名密钥", domain: d.domain, category: d.category,
    color: d.color || "#0A84FF", value: d.value, notes: d.notes,
    expiresAt: d.expiryTs, createdAt: now, updatedAt: now,
  }
}

export type DraftIdentity = {
  id: string; type: IdentityType; value: string; label: string; color: string; notes: string; esim: boolean
}
export const emptyIdentityDraft = (type: IdentityType = "email"): DraftIdentity => ({
  id: "", type, value: "", label: "", color: IDENTITY_COLORS[0], notes: "", esim: false,
})
export const identityDraft = (i: Identity): DraftIdentity => ({
  id: i.id, type: i.type, value: i.value, label: i.label || "", color: i.color,
  notes: i.notes || "", esim: i.esim === true,
})
export const draftToIdentity = (d: DraftIdentity): Identity => ({
  id: d.id || uid(), type: d.type, value: d.value, label: d.label, color: d.color,
  notes: d.notes, esim: d.type === "phone" ? d.esim : undefined, updatedAt: Date.now(),
})

export type DraftAccount = {
  id: string; name: string; domain: string; category: string; notes: string; identityIds: string[]
}
export const emptyAccountDraft = (): DraftAccount => ({
  id: "", name: "", domain: "", category: ACCOUNT_CATEGORIES[0], notes: "", identityIds: [],
})
export const accountDraft = (a: Account): DraftAccount => ({
  id: a.id, name: a.name, domain: a.domain, category: a.category,
  notes: a.notes || "", identityIds: [...a.identityIds],
})
export const draftToAccount = (d: DraftAccount): Account => ({
  id: d.id || uid(), name: d.name, domain: d.domain, category: d.category,
  notes: d.notes, identityIds: d.identityIds, createdAt: Date.now(), updatedAt: Date.now(),
})

// ---------------- preset row ----------------
function PresetRow({ presets, onPick }: { presets: Preset[]; onPick: (p: Preset) => void }) {
  return (
    <Section title="常用平台（点击填入）">
      {presets.map(p => (
        <Button key={p[0]} title={p[0]} action={() => onPick(p)} />
      ))}
    </Section>
  )
}

// ---------------- Token form ----------------
export function TokenForm({ draft, onDraft, onSave, onCancel, deleting, onDelete }: {
  draft: DraftToken
  onDraft: (d: DraftToken) => void
  onSave: () => void
  onCancel: () => void
  deleting: boolean
  onDelete: () => void
}) {
  const set = (patch: Partial<DraftToken>) => onDraft({ ...draft, ...patch })
  const pick = (p: Preset) => set({ name: p[0], domain: p[1], category: p[2], color: p[3] })
  return (
    <Form
      navigationTitle={draft.id ? "编辑密钥" : "添加密钥"}
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="保存" action={onSave} /></ToolbarItem></Toolbar>}
    >
      <PresetRow presets={TOKEN_PRESETS} onPick={pick} />
      <Section title="基本信息">
        <TextField title="名称" value={draft.name} onChanged={v => set({ name: v })} prompt="OpenAI / GitHub PAT" />
        <TextField title="域名" value={draft.domain} onChanged={v => set({ domain: v })} prompt="openai.com" />
        <Picker title="分类" value={draft.category} onChanged={v => set({ category: v })}>
          {TOKEN_CATEGORIES.map(c => <Text tag={c} key={c}>{c}</Text>)}
        </Picker>
      </Section>
      <Section title="密钥">
        <SecureField title="Token / Key" value={draft.value} onChanged={v => set({ value: v })} prompt="粘贴密钥" />
        <TextField title="备注" value={draft.notes} onChanged={v => set({ notes: v })} axis="vertical" prompt="用途、权限范围…" />
      </Section>
      <Section title="到期提醒">
        <DatePicker title="到期日" value={draft.expiryTs} onChanged={v => set({ expiryTs: v })} displayedComponents={["date"]} />
        {draft.expiryTs ? <Button title="清除到期日" action={() => set({ expiryTs: 0 })} /> : null}
      </Section>
      <Section>
        <Button title="取消" action={onCancel} />
        {deleting ? <Button title="删除这条密钥" role="destructive" action={onDelete} /> : null}
      </Section>
    </Form>
  )
}

// ---------------- Identity form ----------------
export function IdentityForm({ draft, onDraft, onSave, onCancel, deleting, onDelete }: {
  draft: DraftIdentity
  onDraft: (d: DraftIdentity) => void
  onSave: () => void
  onCancel: () => void
  deleting: boolean
  onDelete: () => void
}) {
  const set = (patch: Partial<DraftIdentity>) => onDraft({ ...draft, ...patch })
  return (
    <Form
      navigationTitle={draft.id ? "编辑身份" : "添加身份"}
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="保存" action={onSave} /></ToolbarItem></Toolbar>}
    >
      <Section title="类型">
        <Picker title="类型" value={draft.type} onChanged={v => set({ type: v as IdentityType })}>
          <Text tag="email" key="email">邮箱</Text>
          <Text tag="phone" key="phone">手机号</Text>
          <Text tag="login" key="login">登录账号</Text>
        </Picker>
      </Section>
      <Section title="信息">
        <TextField title="值" value={draft.value} onChanged={v => set({ value: v })} prompt={draft.type === "email" ? "name@example.com" : draft.type === "phone" ? "+86 138 ..." : "账号名"} />
        <TextField title="标签" value={draft.label} onChanged={v => set({ label: v })} prompt="主力 / 工作 / 小号" />
        <TextField title="备注" value={draft.notes} onChanged={v => set({ notes: v })} axis="vertical" />
      </Section>
      <Section title="卡片颜色">
        <Picker title="颜色" value={draft.color} onChanged={v => set({ color: v })}>
          {IDENTITY_COLORS.map(c => <Text tag={c} key={c}>{c}</Text>)}
        </Picker>
      </Section>
      {draft.type === "phone" ? (
        <Section><Toggle title="eSIM 副卡" value={draft.esim} onChanged={v => set({ esim: v })} /></Section>
      ) : null}
      <Section>
        <Button title="取消" action={onCancel} />
        {deleting ? <Button title="删除这个身份" role="destructive" action={onDelete} /> : null}
      </Section>
    </Form>
  )
}

// ---------------- Account form (with multi-select identities) ----------------
export function AccountForm({ draft, identities, onDraft, onSave, onCancel, deleting, onDelete }: {
  draft: DraftAccount
  identities: Identity[]
  onDraft: (d: DraftAccount) => void
  onSave: () => void
  onCancel: () => void
  deleting: boolean
  onDelete: () => void
}) {
  const set = (patch: Partial<DraftAccount>) => onDraft({ ...draft, ...patch })
  const pick = (p: Preset) => set({ name: p[0], domain: p[1], category: p[2] })
  const toggleId = (id: string) => {
    const has = draft.identityIds.includes(id)
    set({ identityIds: has ? draft.identityIds.filter(x => x !== id) : [...draft.identityIds, id] })
  }
  return (
    <Form
      navigationTitle={draft.id ? "编辑网站" : "添加网站"}
      toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="保存" action={onSave} /></ToolbarItem></Toolbar>}
    >
      <PresetRow presets={SITE_PRESETS} onPick={pick} />
      <Section title="基本信息">
        <TextField title="名称" value={draft.name} onChanged={v => set({ name: v })} prompt="GitHub / 淘宝" />
        <TextField title="域名" value={draft.domain} onChanged={v => set({ domain: v })} prompt="github.com" />
        <Picker title="分类" value={draft.category} onChanged={v => set({ category: v })}>
          {ACCOUNT_CATEGORIES.map(c => <Text tag={c} key={c}>{c}</Text>)}
        </Picker>
        <TextField title="备注" value={draft.notes} onChanged={v => set({ notes: v })} axis="vertical" />
      </Section>
      <Section title="关联身份（可多选）">
        {identities.length === 0 ? (
          <Text font="caption" foregroundStyle="secondaryLabel">先去卡包添加邮箱或手机号</Text>
        ) : identities.map(i => (
          <Toggle
            key={i.id}
            title={i.label || i.value}
            value={draft.identityIds.includes(i.id)}
            onChanged={() => toggleId(i.id)}
          />
        ))}
      </Section>
      <Section>
        <Button title="取消" action={onCancel} />
        {deleting ? <Button title="删除这个网站" role="destructive" action={onDelete} /> : null}
      </Section>
    </Form>
  )
}
