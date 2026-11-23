import { Navigation, NavigationStack, VStack, HStack, Text, TextField, Image, Button, ScrollView, LazyVGrid, useState } from 'scripting'
import { IconItem } from './subscriptions'
export function Tile({ icon, source }: { icon: IconItem; source?: string }) {
 const [failed, setFailed] = useState(false)
 async function copyLink() {
  try { await Pasteboard.setString(icon.url); await Dialog.alert({ title: '已复制图标链接', message: icon.name }) }
  catch { await Dialog.alert('复制失败，请重试。') }
 }
 return <VStack spacing={8} padding={8} contextMenu={{ menuItems: <Button title="复制图标链接" systemImage="doc.on.doc" action={() => { void copyLink() }}/> }}> 
 {failed ? <Image systemName="photo.badge.exclamationmark" font={28} foregroundStyle="secondaryLabel" frame={{ width: 48, height: 48 }}/> : <Image imageUrl={icon.url} onError={() => setFailed(true)} placeholder={<Image systemName="photo" foregroundStyle="secondaryLabel"/>} resizable frame={{ width: 48, height: 48 }} />}
 <Text font="caption2" lineLimit={2}>{icon.name}</Text>
 {source ? <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={2}>{source}</Text> : null}
 </VStack>
}
export default function Preview({ name, icons }: { name: string; icons: IconItem[] }) {
 const dismiss = Navigation.useDismiss()
 const [query, setQuery] = useState('')
 const items = icons.filter(x => x.name.toLowerCase().includes(query.toLowerCase()))
 return <NavigationStack><VStack spacing={14} padding={16} navigationTitle={name} navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title="完成" action={dismiss}/> }}>
 <TextField title="搜索图标名称" value={query} onChanged={setQuery}/>
 <HStack><Text font="caption" foregroundStyle="secondaryLabel">{items.length} 个图标 · 长按显示复制菜单</Text></HStack>
 <ScrollView><LazyVGrid columns={[{ size: { type: 'adaptive', min: 76 } }]} spacing={16}>{items.map((icon, i) => <Tile key={icon.url + '-' + i} icon={icon}/>)}</LazyVGrid>{items.length === 0 ? <Text padding={30}>没有匹配的图标</Text> : null}</ScrollView>
 </VStack></NavigationStack>
}
