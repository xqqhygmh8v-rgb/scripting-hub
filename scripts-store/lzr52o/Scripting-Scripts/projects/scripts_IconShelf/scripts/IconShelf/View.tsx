import { Navigation, NavigationStack, List, Section, VStack, HStack, Text, Image, Button, Spacer, ScrollView, TextField, useState, useRef, useEffect, ScrollViewReader, ScrollViewProxy } from 'scripting'

import { IconItem, filename, normalize, loadSubscription, Subscription } from './subscriptions'
import Preview from './Preview'
import GlobalIconResults from './GlobalIconResults'
import SourceView from './SourceView'
import OrderView from './OrderView'
import GroupChip from './GroupChip'
import PackCover from './PackCover'
import { quantumultIconLink, loonIconLink } from './import-links'

type Pack = { customName?: string | null; sourceName?: string; rawText?: string; icons?: IconItem[]; updatedAt?: string; error?: string; id: string; name: string; group: string; url: string; note: string; symbol: string; color: `#${string}`; demo?: boolean }
type Store = { groups: string[]; packs: Pack[] }
function withSubscription(p: Pack, data: Subscription): Pack {
 const customName = p.customName === undefined ? (p.name === filename(p.url) ? null : p.name) : p.customName
 return { ...p, customName, sourceName: data.sourceName, name: customName || data.sourceName || filename(p.url), icons: data.icons, rawText: data.rawText, note: data.description, updatedAt: new Date().toISOString(), error: undefined }
}
const key = 'iconshelf.v1'
const initial: Store = { groups: ['未分类'], packs: [] }
function orderedGroups(groups: string[]): string[] { return [...new Set(groups.filter(g => g !== '未分类')), '未分类'] }
function load(): Store {
 const old = Storage.get<Store>(key)
 if (!old) return initial
 if (Storage.get<boolean>('iconshelf.clean-v2')) {
  const next = { ...old, groups: orderedGroups(old.groups) }
  if (!Storage.get<boolean>('iconshelf.oldest-first-v1')) {
   // 旧版原生导入 ID 为时间戳；恢复的备份 ID 带序号，保留备份顺序。
   if (next.packs.every(p => /^\d{13}$/.test(p.id))) next.packs = [...next.packs].sort((a, b) => Number(a.id) - Number(b.id))
   if (Storage.set(key, next)) Storage.set('iconshelf.oldest-first-v1', true)
  }
  return next
 }
 const packs = old.packs.filter(p => !p.demo)
 // 仅清理旧版空的预设分类；保留用户分组及真实订阅所属分类。
 const groups = old.groups.filter(g => !['国旗', '影音', 'App'].includes(g) || packs.some(p => p.group === g))
 const next = { groups: orderedGroups(groups), packs }
 if (Storage.set(key, next)) Storage.set('iconshelf.clean-v2', true)
 return next
}
const apps = ['Loon', 'Quantumult X']
const accent = '#5965DE'
export default function View() {
 const dismiss = Navigation.useDismiss()
 const [store, setStore] = useState<Store>(load)
 const [group, setGroup] = useState('全部')
 const [query, setQuery] = useState('')
 const [searchMode, setSearchMode] = useState('订阅')
 const [iconQuery, setIconQuery] = useState('')
 const [busy, setBusy] = useState('')
 const lock = useRef(false)
 const presenting = useRef(false)
 const scrollProxy = useRef<ScrollViewProxy>()
 const [scrollTarget, setScrollTarget] = useState<string | null>(null)
 useEffect(() => {
  if (!scrollTarget || busy) return
  // 等待新增行与筛选条件更新完成后再定位。
  const timer = setTimeout(() => {
   withAnimation(() => scrollProxy.current?.scrollTo(scrollTarget, 'center'))
   setScrollTarget(null)
  }, 250)
  return () => clearTimeout(timer)
 }, [scrollTarget, busy, group, query])
 async function refresh(packs: Pack[]) {
  if (lock.current) return
  if (!packs.length) { await Dialog.alert('请先添加订阅'); return }
  lock.current = true
  let next = store
  const errors: string[] = []
  let success = 0
  try {
   for (let i = 0; i < packs.length; i++) {
    const p = packs[i]
    setBusy(`更新 ${i + 1}/${packs.length} · ${p.name}`)
    try {
     const data = await loadSubscription(p.url)
     next = { ...next, packs: next.packs.map(x => x.id === p.id ? withSubscription(x, data) : x) }
     save(next); success++
    } catch (e) {
     const message = String(e instanceof Error ? e.message : e)
     errors.push(p.name + '：' + message)
     next = { ...next, packs: next.packs.map(x => x.id === p.id ? { ...x, error: message } : x) }
     try { save(next) } catch {}
    }
   }
  } finally { lock.current = false; setBusy('') }
  await Dialog.alert({ title: `更新完成：成功 ${success}，失败 ${errors.length}`, message: errors.length ? errors.join('\n') + '\n失败订阅保留上次图标数据。' : '已获取最新图标清单，自定义名称和分组保持不变。' })
 }
 async function preview(p: Pack) {
  if (presenting.current || lock.current) return
  presenting.current = true
  try {
   if (!p.icons?.length) { await refresh([p]); return }
   await Navigation.present(<Preview name={p.name} icons={p.icons}/>)
  } finally { presenting.current = false }
 }
 async function viewSource(p: Pack) {
  if (presenting.current || lock.current) return
  presenting.current = true
  try {
   let pack = p
   if (!pack.rawText) {
    lock.current = true; setBusy('正在读取图标集文件…')
    try {
     pack = withSubscription(p, await loadSubscription(p.url))
     save({ ...store, packs: store.packs.map(x => x.id === p.id ? pack : x) })
    } finally { lock.current = false; setBusy('') }
   }
   await Navigation.present(<SourceView name={filename(pack.url)} url={pack.url} rawText={pack.rawText!} updatedAt={pack.updatedAt}/>)
  } catch (e) { await Dialog.alert({ title: '无法查看文件', message: String(e instanceof Error ? e.message : e) }) }
  finally { presenting.current = false }
 }
 async function options() {
  const n = await Dialog.actionSheet({ title: '更多', actions: [{ label: '管理分组' }, { label: '导出备份' }, { label: '恢复备份' }] })
  if (n === 0) await editGroups()
  if (n === 1) await backup()
  if (n === 2) await restore()

 }
 async function reorder(kind: 'groups' | 'packs') {
  if (presenting.current || lock.current) return
  const items = kind === 'groups' ? store.groups.filter(g => g !== '未分类').map(g => ({ id: g, title: g })) : store.packs.map(p => ({ id: p.id, title: p.name }))
  if (items.length < 2) { await Dialog.alert('至少需要两项才能调整顺序。'); return }
  presenting.current = true
  try {
   await Navigation.present(<OrderView title={kind === 'groups' ? '分组排序' : '图标集排序'} items={items} note={kind === 'groups' ? '未分类固定在最后。' : '调整的是所有图标集的全局顺序，分组内同步显示。'} onSave={ids => {
    if (ids.length !== items.length || new Set(ids).size !== items.length || ids.some(id => !items.some(x => x.id === id))) throw Error('排序数据不完整，未保存。')
    if (kind === 'groups') save({ ...store, groups: [...ids, '未分类'] })
    else save({ ...store, packs: ids.map(id => store.packs.find(p => p.id === id)!) })
   }}/>)
  } finally { presenting.current = false }
 }
 async function groupMenu(g: string) {
  if (g === '全部' || g === '未分类') return
  const action = await Dialog.actionSheet({ title: `分组「${g}」`, message: '管理这个分组，不会影响其他分组。', actions: [{ label: '重命名' }, { label: '调整分组顺序' }, { label: '删除分组', destructive: true }] })
  if (action === 0) await renameGroup(g)
  if (action === 1) await reorder('groups')
  if (action === 2) await removeGroup(g)
 }
 async function renameGroup(g: string) {
  if (g === '全部' || g === '未分类') return
  const name = (await Dialog.prompt({ title: '重命名分组', defaultValue: g }))?.trim()
  if (!name || name === g) return
  if (['全部', ...store.groups].includes(name)) { await Dialog.alert('分组名称已存在'); return }
  save({ groups: store.groups.map(x => x === g ? name : x), packs: store.packs.map(p => p.group === g ? { ...p, group: name } : p) })
  if (group === g) setGroup(name)
 }
 async function editGroups() {
  const groups = store.groups.filter(g => g !== '未分类')
  const n = await Dialog.actionSheet({ title: '管理分组', actions: [{ label: '新建分组' }, ...groups.map(label => ({ label }))] })
  if (n == null) return
  if (n === 0) { await addGroup(); return }
  const g = groups[n - 1]
  const action = await Dialog.actionSheet({ title: g, actions: [{ label: '重命名' }, { label: '删除分组', destructive: true }, { label: '调整分组顺序' }] })
  if (action === 1) await removeGroup(g)
  if (action === 2) await reorder('groups')
  if (action === 0) await renameGroup(g)
 }
 function save(next: Store) { next = { ...next, groups: orderedGroups(next.groups) }; if (!Storage.set(key, next)) { void Dialog.alert('保存失败，请重试。'); throw Error('本地保存失败') }; setStore(next) }
 async function chooseGroup() { const n = await Dialog.actionSheet({ title: '选择分组', actions: store.groups.map(label => ({ label })) }); return n == null ? null : store.groups[n] }
 async function add() {
  const url = await Dialog.prompt({ title: '添加图标集', message: '粘贴图标集订阅的 HTTP / HTTPS 地址', placeholder: 'https://…', keyboardType: 'URL' })
  if (url == null) return
  if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url.trim())) { await Dialog.alert('请输入有效的 HTTP / HTTPS 地址。'); return }
  if (store.packs.some(p => normalize(p.url) === normalize(url))) { await Dialog.alert('这条订阅已经在你的库里了。'); return }
  const name = await Dialog.prompt({ title: '图标集名称（可选）', message: '留空优先读取图标包内的 name；没有名称时使用链接文件名。', placeholder: '自动读取图标包名称' }); if (name == null) return
  const category = store.groups.length === 1 ? '未分类' : await chooseGroup(); if (category == null) return
  if (lock.current) return
  lock.current = true; setBusy('正在读取图标集…')
  try {
   const data = await loadSubscription(url.trim())
   const pack: Pack = { id: String(Date.now()), customName: name.trim() || null, name: '', group: category, url: url.trim(), note: '', symbol: 'square.stack.3d.up.fill', color: accent }
   const added = withSubscription(pack, data)
   save({ ...store, packs: [...store.packs, added] })
   if (group !== '全部' && group !== category) setGroup('全部')
   if (!(added.name + added.note + added.group).toLowerCase().includes(query.toLowerCase())) setQuery('')
   setSearchMode('订阅')
   setScrollTarget(pack.id)
  } catch (e) { await Dialog.alert({ title: '添加失败', message: String(e instanceof Error ? e.message : e) }) }
  finally { lock.current = false; setBusy('') }
 }
 async function importPack(p: Pack) {
  if (p.demo) { await Dialog.alert({ title: '这是展示用图标集', message: '示例没有真实订阅地址。请点击右上角 + 添加你自己的订阅。' }); return }
  if (presenting.current || lock.current) return
  presenting.current = true
  try {
   const n = await Dialog.actionSheet({ title: '导入到…', message: '打开图标集添加链接，请在目标 App 中确认。', actions: apps.map(label => ({ label })) }); if (n == null) return

    const opened = await Safari.openURL(apps[n] === 'Loon' ? loonIconLink(p.url) : quantumultIconLink(p.url))
    if (!opened && await Dialog.confirm({ title: '无法打开导入链接', message: `请确认已安装 ${apps[n]}。是否改为复制订阅链接？`, confirmLabel: '复制链接' })) {
     await Pasteboard.setString(p.url)
     await Dialog.alert(`已复制订阅链接，请在 ${apps[n]} 内手动添加。`)
    }

  } catch (e) { await Dialog.alert({ title: '无法发起导入', message: String(e instanceof Error ? e.message : e) }) }
  finally { presenting.current = false }
 }
 async function manage(p: Pack) {
  const n = await Dialog.actionSheet({ title: p.name, actions: [{ label: '移动到分组' }, { label: '重命名' }, { label: '复制订阅链接' }, { label: '移除订阅', destructive: true }, { label: '更新图标集' }, { label: '预览图标' }, { label: '查看图标集文件' }] })
  if (n === 0) { const g = await chooseGroup(); if (g) save({ ...store, packs: store.packs.map(x => x.id === p.id ? { ...x, group: g } : x) }) }
  if (n === 1) { const name = await Dialog.prompt({ title: '重命名', message: '清空后恢复自动读取图标包名称。', defaultValue: p.name }); if (name != null) save({ ...store, packs: store.packs.map(x => x.id === p.id ? { ...x, customName: name.trim() || null, name: name.trim() || p.sourceName || filename(p.url) } : x) }) }
  if (n === 2) { if (!p.url) await Dialog.alert('示例没有真实订阅链接'); else { await Pasteboard.setString(p.url); await Dialog.alert('已复制') } }
  if (n === 4) await refresh([p])
  if (n === 5) await preview(p)
  if (n === 6) await viewSource(p)
  if (n === 3 && await Dialog.confirm('仅从管理工具中移除此订阅？不会修改其他软件。')) save({ ...store, packs: store.packs.filter(x => x.id !== p.id) })
 }
 async function addGroup() { const name = await Dialog.prompt({ title: '新建分组', placeholder: '输入你想要的分组名称' }); if (!name?.trim()) return; if (['全部', ...store.groups].includes(name.trim())) { await Dialog.alert('分组名称已存在'); return }; save({ ...store, groups: [...store.groups, name.trim()] }) }
 async function removeGroup(g: string) { if (g === '未分类') return; if (await Dialog.confirm(`删除“${g}”分组？其中订阅将移到未分类。`)) { save({ groups: store.groups.filter(x => x !== g), packs: store.packs.map(p => p.group === g ? { ...p, group: '未分类' } : p) }); setGroup('全部') } }
 async function backup() {
  const n = await Dialog.actionSheet({ title: '导出备份', message: '包含名称、分组、排列顺序与订阅链接，不包含图标缓存。链接可能含有私密令牌，请妥善保存。', actions: [{ label: '保存到文件…' }, { label: '复制备份文本' }] })
  if (n == null) return
  const text = JSON.stringify({ version: 1, ...store, groups: orderedGroups(store.groups), packs: store.packs.map(({ icons, error, updatedAt, rawText, ...p }) => p) }, null, 2)
  try {
   if (n === 1) { await Pasteboard.setString(text); await Dialog.alert('备份 JSON 已复制'); return }
   const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
   const data = Data.fromString(text)
   if (!data) throw Error('无法编码备份文本')
   const paths = await DocumentPicker.exportFiles({ files: [{ data, name: `IconShelf-backup-${stamp}.json` }] })
   if (paths?.length) await Dialog.alert({ title: '备份已导出', message: paths.join('\n') })
  } catch (e) { await Dialog.alert({ title: '导出失败', message: String(e instanceof Error ? e.message : e) }) }
 }
 async function restore() {
  const n = await Dialog.actionSheet({ title: '恢复备份', message: '恢复后会替换当前订阅库；图标缓存需通过全部更新获取。', actions: [{ label: '从文件选择…' }, { label: '粘贴备份文本' }] })
  if (n == null) return
  let raw: string | null = null
  try {
   if (n === 0) {
    const paths = await DocumentPicker.pickFiles({ types: ['public.json', 'public.text'], allowsMultipleSelection: false })
    if (!paths?.length) return
    raw = await FileManager.readAsString(paths[0])
   } else raw = await Dialog.prompt({ title: '恢复备份', message: '粘贴本工具导出的 JSON。确认后替换当前订阅库。' })
  } catch (e) { await Dialog.alert({ title: '读取备份失败', message: String(e instanceof Error ? e.message : e) }); return }
  if (!raw) return
  if (raw.length > 8 * 1024 * 1024) { await Dialog.alert('备份文件过大，未修改现有数据。'); return }
  try { const x = JSON.parse(raw); if (x.version !== 1 || !Array.isArray(x.groups) || !x.groups.every((g: unknown) => typeof g === 'string' && g.length > 0) || !Array.isArray(x.packs) || !x.packs.every((p: Pack) => typeof p.id === 'string' && typeof p.name === 'string' && typeof p.url === 'string' && typeof p.group === 'string' && (p.url === '' || /^https?:\/\/\S+$/.test(p.url)))) throw Error(); if (await Dialog.confirm('用备份替换当前订阅库？')) { const groups = Array.from(new Set<string>([...x.groups, '未分类'])); save({ groups, packs: x.packs.map((p: Pack, i: number) => ({ ...p, id: String(Date.now()) + '-' + i, group: groups.includes(p.group) ? p.group : '未分类', symbol: 'square.stack.3d.up.fill', color: accent, note: '从备份恢复', icons: undefined, error: undefined, updatedAt: undefined, rawText: undefined, demo: !p.url })) }); setGroup('全部') } } catch { await Dialog.alert('备份格式无效，未修改现有数据。') }
 }
 const visible = store.packs.filter(p => (group === '全部' || p.group === group) && (p.name + p.note + p.group).toLowerCase().includes(query.toLowerCase()))
 return <NavigationStack><ScrollViewReader>{proxy => {
   scrollProxy.current = proxy
   return <VStack spacing={0} buttonStyle="borderless" disabled={!!busy} navigationTitle="IconShelf" navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} />, primaryAction: <HStack spacing={20}><Button action={options}><Image systemName="ellipsis.circle" foregroundStyle={accent} /></Button><Button action={add}><Image systemName="plus" foregroundStyle={accent} /></Button></HStack> }}>

   {busy ? <Section><Text font="subheadline" foregroundStyle={accent}>{busy}</Text></Section> : null}
    <Section padding={16}><HStack padding={{ bottom: 12 }}><Image systemName="magnifyingglass" foregroundStyle="secondaryLabel"/><TextField title={searchMode === '订阅' ? '搜索订阅' : '搜索所有图标集中的图标'} value={searchMode === '订阅' ? query : iconQuery} onChanged={searchMode === '订阅' ? setQuery : setIconQuery}/></HStack>
    <HStack spacing={16} padding={{ bottom: 12 }}>{['订阅', '图标'].map(mode => <Button title={mode === '订阅' ? '搜索订阅' : '全局图标'} action={() => setSearchMode(mode)} foregroundStyle={searchMode === mode ? accent : 'secondaryLabel'} fontWeight={searchMode === mode ? 'bold' : 'regular'}/>)}<Spacer/></HStack>
    {searchMode === '订阅' ? <ScrollView axes="horizontal"><HStack spacing={10}>{['全部', ...store.groups].map(g => <GroupChip key={g} name={g} selected={group === g} onSelect={() => setGroup(g)} onRename={g === '全部' || g === '未分类' ? undefined : () => renameGroup(g)} onReorder={g === '全部' || g === '未分类' ? undefined : () => reorder('groups')} onDelete={g === '全部' || g === '未分类' ? undefined : () => removeGroup(g)}/>)}<Button action={addGroup}><HStack spacing={4}><Image systemName="plus" font={12}/><Text font="subheadline">分组</Text></HStack></Button></HStack></ScrollView> : null}
   </Section>
   {searchMode === '图标' ? <GlobalIconResults packs={store.packs} query={iconQuery}/> : <List buttonStyle="borderless"><Section header={<HStack><Text>我的图标集 · {visible.length}</Text><Spacer/><Button title="全部更新" action={() => refresh(store.packs)}/></HStack>} >
    {visible.map(p => <VStack key={p.id} contextMenu={{ menuItems: <Button title="调整图标集顺序" systemImage="arrow.up.arrow.down" action={() => reorder('packs')}/> }} alignment="leading" spacing={14} padding={{ top: 10, bottom: 10 }}>
     <HStack spacing={12}><PackCover key={p.id + (p.icons?.[0]?.url || '') + (p.updatedAt || '')} url={p.icons?.[0]?.url}/><VStack alignment="leading" spacing={5}><Text font="headline">{p.name}</Text><Text font="caption" foregroundStyle="secondaryLabel">{p.icons ? `${p.icons.length} 个图标` : '待更新'}{p.updatedAt ? ' · ' + new Date(p.updatedAt).toLocaleDateString() + ' 更新' : ''}</Text></VStack><Spacer/><Button action={() => manage(p)}><Image systemName="ellipsis" /></Button></HStack>
     <HStack><Text font="caption" foregroundStyle={p.color}>{p.group}</Text><Spacer/><Button title="预览" action={() => preview(p)}/><Button action={() => importPack(p)}><HStack spacing={5}><Text font="subheadline">导入到软件</Text><Image systemName="arrow.up.forward" font={11}/></HStack></Button></HStack>
    {p.error ? <Text font="caption" foregroundStyle="systemRed">更新失败 · {p.error}</Text> : null}</VStack>)}
    {visible.length === 0 ? <VStack spacing={10} padding={{ top: 24, bottom: 24 }} frame={{ maxWidth: Infinity }}><Image systemName="square.stack.3d.up" font={26} foregroundStyle="secondaryLabel"/><Text font="subheadline" foregroundStyle="secondaryLabel">{store.packs.length === 0 ? '暂无订阅，点击右上角 ＋ 添加' : '暂无匹配订阅'}</Text></VStack> : null}
   </Section>
 </List>}</VStack>
  }}</ScrollViewReader></NavigationStack>
}
