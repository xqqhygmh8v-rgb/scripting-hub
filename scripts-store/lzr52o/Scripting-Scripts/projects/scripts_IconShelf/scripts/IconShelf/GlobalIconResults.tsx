import { Text, VStack, ScrollView, LazyVGrid } from 'scripting'
import { IconItem } from './subscriptions'
import { Tile } from './Preview'
type Pack = { id: string; name: string; icons?: IconItem[] }
export default function GlobalIconResults({ packs, query }: { packs: Pack[]; query: string }) {
 const term = query.trim().toLowerCase()
 const missing = packs.filter(p => !p.icons?.length).length
 const results = term ? packs.flatMap(p => (p.icons || []).map((icon, index) => ({ icon, source: p.name, key: p.id + ':' + index })).filter(x => x.icon.name.toLowerCase().includes(term))) : []
 return <ScrollView><VStack alignment="leading" spacing={16} padding={16}>
 <Text font="headline" foregroundStyle="secondaryLabel">全局图标 · {results.length} 个结果</Text>
 {!term ? <Text foregroundStyle="secondaryLabel" padding={16}>输入图标名称，搜索所有图标集</Text> : results.length === 0 ? <Text foregroundStyle="secondaryLabel" padding={16}>没有匹配的图标</Text> : null}
 <LazyVGrid columns={[{ size: { type: 'flexible' } }, { size: { type: 'flexible' } }, { size: { type: 'flexible' } }]} spacing={18}>
 {results.map(x => <Tile key={x.key} icon={x.icon} source={x.source}/>)}
 </LazyVGrid>
 <Text font="caption" foregroundStyle="secondaryLabel">{missing ? `${missing} 套订阅尚无图标清单，请先全部更新。` : '搜索覆盖所有分组的本地图标清单。'} 长按图标，在菜单中选择复制图标链接。</Text>
 </VStack></ScrollView>
}
