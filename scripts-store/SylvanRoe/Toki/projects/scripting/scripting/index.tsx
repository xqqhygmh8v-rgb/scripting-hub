import {
  TabView, Tab, NavigationStack, Text, HStack, VStack, Spacer, Image, Button,
  Toolbar, ToolbarItem, Form, Section, Toggle, Picker, useState, useEffect, Script, Navigation,
  Pasteboard, Dialog,
} from "scripting"
import { TokiState, TokiSettings, Identity, Account, Token, IdentityType, defaultSettings } from "./types"
import {
  loadState, saveState, loadSettings, saveSettings, importPayload, exportPayload, writeSnapshot,
  upsertIdentity, upsertAccount, upsertToken, deleteIdentity, deleteAccount, deleteToken, clearAll,
} from "./store"
import {
  DraftToken, DraftIdentity, DraftAccount, TokenForm, IdentityForm, AccountForm,
  emptyTokenDraft, tokenDraft, draftToToken, emptyIdentityDraft, identityDraft, draftToIdentity,
  emptyAccountDraft, accountDraft, draftToAccount, copyText,
} from "./components"
import { WalletPage, SitesPage, TokensPage, GraphPage } from "./pages"
import { makeDemoState } from "./presets"

type Modal =
  | { kind: "token"; draft: DraftToken }
  | { kind: "identity"; draft: DraftIdentity }
  | { kind: "account"; draft: DraftAccount }
  | { kind: "settings" }
  | null

export function App() {
  const [state, setState] = useState<TokiState>(() => loadState())
  const [settings, setSettings] = useState<TokiSettings>(() => loadSettings())
  const [tab, setTab] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [siteFilter, setSiteFilter] = useState("全部")
  const [tokenFilter, setTokenFilter] = useState("全部")
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const commit = (next: TokiState) => { setState(next); saveState(next) }
  const flash = (m: string) => setToast(m)

  useEffect(() => { writeSnapshot(state) }, [])

  // ---- modal openers ----
  const addToken = () => setModal({ kind: "token", draft: emptyTokenDraft() })
  const editToken = (t: Token) => setModal({ kind: "token", draft: tokenDraft(t) })
  const addIdentity = () => setModal({ kind: "identity", draft: emptyIdentityDraft() })
  const editIdentity = (i: Identity) => setModal({ kind: "identity", draft: identityDraft(i) })
  const addAccount = () => setModal({ kind: "account", draft: emptyAccountDraft() })
  const editAccount = (a: Account) => setModal({ kind: "account", draft: accountDraft(a) })

  // ---- saves ----
  const saveTokenDraft = (d: DraftToken) => {
    if (!d.name.trim() || !d.value.trim()) { flash("请填写名称和密钥"); return }
    commit(upsertToken(state, draftToToken(d))); setModal(null); flash("密钥已保存")
  }
  const saveIdentityDraft = (d: DraftIdentity) => {
    if (!d.value.trim()) { flash("请填写邮箱/号码/账号"); return }
    commit(upsertIdentity(state, draftToIdentity(d))); setModal(null); flash("身份已保存")
  }
  const saveAccountDraft = (d: DraftAccount) => {
    if (!d.name.trim()) { flash("请填写网站名称"); return }
    commit(upsertAccount(state, draftToAccount(d))); setModal(null); flash("网站已保存")
  }

  // ---- deletes ----
  const deleteTokenDraft = (d: DraftToken) => { commit(deleteToken(state, d.id)); setModal(null); flash("已删除") }
  const deleteIdentityDraft = (d: DraftIdentity) => { commit(deleteIdentity(state, d.id)); setModal(null); flash("已删除") }
  const deleteAccountDraft = (d: DraftAccount) => { commit(deleteAccount(state, d.id)); setModal(null); flash("已删除") }

  const toggleReveal = (id: string) => {
    const n = new Set(revealed); if (n.has(id)) n.delete(id); else n.add(id); setRevealed(n)
  }
  const copy = (v: string) => { copyText(v); flash("已复制") }

  // ---- global features ----
  const loadDemo = () => {
    commit(makeDemoState()); setModal(null); flash("已载入示例数据")
  }
  const importData = async () => {
    const text = await Pasteboard.string()
    if (!text) { flash("剪贴板里没有 Toki 备份 JSON"); return }
    try {
      const next = importPayload(text); commit(next); setModal(null)
      flash(`已导入 ${next.tokens.length} 条密钥`)
    } catch { flash("导入失败：不是有效的 Toki 备份") }
  }
  const exportData = async () => {
    await Pasteboard.setString(exportPayload(state)); flash("备份 JSON 已复制到剪贴板")
  }
  const updateSettings = (s: TokiSettings) => { setSettings(s); saveSettings(s) }
  const wipe = () => { commit(clearAll(state)); setConfirmWipe(false); setModal(null); flash("已清空") }

  return (
    <NavigationStack preferredColorScheme={settings.theme === "system" ? undefined : settings.theme}>
      <TabView
        tabIndex={tab}
        onTabIndexChanged={setTab}
        toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="" systemImage="gear" action={() => setModal({ kind: "settings" })} /></ToolbarItem></Toolbar>}
      >
        <Tab title="卡包" systemImage="creditcard" value={0}>
          <WalletPage state={state} settings={settings} onAdd={addIdentity} onEdit={editIdentity} onCopy={copy} />
        </Tab>
        <Tab title="网站" systemImage="safari" value={1}>
          <SitesPage state={state} filter={siteFilter} onFilter={setSiteFilter} onAdd={addAccount} onEdit={editAccount} />
        </Tab>
        <Tab title="Tokens" systemImage="key.fill" value={2}>
          <TokensPage
            state={state} filter={tokenFilter} onFilter={setTokenFilter} revealed={revealed}
            onAdd={addToken} onEdit={editToken} onCopy={copy} onToggleReveal={toggleReveal}
          />
        </Tab>
        <Tab title="关系" systemImage="network" value={3}>
          <GraphPage state={state} onOpenSite={editAccount} />
        </Tab>
      </TabView>

      <Text
        alert={{
          title: "Toki", isPresented: toast !== null,
          onChanged: v => { if (!v) setToast(null) },
          actions: <Button title="好" action={() => setToast(null)} />,
          message: toast ? <Text>{toast}</Text> : undefined,
        }}
      />

      {/* ---- token modal ---- */}
      {modal?.kind === "token" ? (
        <Text sheet={{ isPresented: true, onChanged: v => { if (!v) setModal(null) },
          content: <TokenForm
            draft={modal.draft}
            onDraft={d => setModal({ kind: "token", draft: d })}
            onSave={() => saveTokenDraft(modal.draft)}
            onCancel={() => setModal(null)}
            deleting={!!modal.draft.id}
            onDelete={() => deleteTokenDraft(modal.draft)}
          />,
        }} />
      ) : null}

      {/* ---- identity modal ---- */}
      {modal?.kind === "identity" ? (
        <Text sheet={{ isPresented: true, onChanged: v => { if (!v) setModal(null) },
          content: <IdentityForm
            draft={modal.draft}
            onDraft={d => setModal({ kind: "identity", draft: d })}
            onSave={() => saveIdentityDraft(modal.draft)}
            onCancel={() => setModal(null)}
            deleting={!!modal.draft.id}
            onDelete={() => deleteIdentityDraft(modal.draft)}
          />,
        }} />
      ) : null}

      {/* ---- account modal ---- */}
      {modal?.kind === "account" ? (
        <Text sheet={{ isPresented: true, onChanged: v => { if (!v) setModal(null) },
          content: <AccountForm
            draft={modal.draft} identities={state.identities}
            onDraft={d => setModal({ kind: "account", draft: d })}
            onSave={() => saveAccountDraft(modal.draft)}
            onCancel={() => setModal(null)}
            deleting={!!modal.draft.id}
            onDelete={() => deleteAccountDraft(modal.draft)}
          />,
        }} />
      ) : null}

      {/* ---- settings modal ---- */}
      {modal?.kind === "settings" ? (
        <Text sheet={{ isPresented: true, onChanged: v => { if (!v) setModal(null) },
          content: (
            <Form navigationTitle="设置"
              toolbar={<Toolbar><ToolbarItem placement="topBarTrailing"><Button title="完成" action={() => setModal(null)} /></ToolbarItem></Toolbar>}>
              <Section title="外观与隐私">
                <Picker title="主题" value={settings.theme} onChanged={v => updateSettings({ ...settings, theme: v as TokiSettings["theme"] })}>
                  <Text tag="system" key="s">跟随系统</Text>
                  <Text tag="light" key="l">浅色</Text>
                  <Text tag="dark" key="d">深色</Text>
                </Picker>
                <Toggle title="隐私模式（打码身份）" value={settings.privacy} onChanged={v => updateSettings({ ...settings, privacy: v })} />
              </Section>
              <Section title="数据">
                <Button title="载入示例数据" systemImage="sparkles" action={loadDemo} />
                <Button title="导入备份（读剪贴板）" systemImage="square.and.arrow.down" action={importData} />
                <Button title="导出备份（写剪贴板）" systemImage="square.and.arrow.up" action={exportData} />
              </Section>
              <Section title="危险操作">
                <Button title="清空全部数据" role="destructive" action={() => setConfirmWipe(true)} />
              </Section>
              <Section>
                <Text font="caption" foregroundStyle="secondaryLabel">Toki · 网页版导出的 JSON 可通过分享或剪贴板导入。小组件只显示脱敏摘要。</Text>
              </Section>
            </Form>
          ),
        }} />
      ) : null}

      {/* ---- wipe confirmation ---- */}
      <Text
        confirmationDialog={{
          title: "清空全部数据？", isPresented: confirmWipe,
          onChanged: v => setConfirmWipe(v),
          message: <Text>所有身份、网站和密钥都会删除，小组件也会同步清空。建议先导出备份。</Text>,
          actions: <Button title="确认清空" role="destructive" action={wipe} />,
        }}
      />
    </NavigationStack>
  )
}

// Navigation.present() resolves only AFTER the UI is dismissed.
// Never call Script.exit() synchronously here — that would close the app instantly
// and leave only the widget (which runs in a separate, persistent context).
Navigation.present(<App />).then(() => Script.exit()).catch(() => Script.exit())
