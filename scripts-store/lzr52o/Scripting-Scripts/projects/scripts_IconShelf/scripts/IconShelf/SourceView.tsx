import { Navigation, NavigationStack, VStack, HStack, Text, Button, ScrollView, useState } from 'scripting'
export default function SourceView({ name, url, rawText, updatedAt }: { name: string; url: string; rawText: string; updatedAt?: string }) {
 const dismiss = Navigation.useDismiss()
 const [page, setPage] = useState(0)
 const size = 6000
 const pages = Math.max(1, Math.ceil(rawText.length / size))
 async function copy() { await Pasteboard.setString(rawText); await Dialog.alert('已复制完整 JSON 原文，不仅是当前页。') }
 return <NavigationStack><VStack spacing={12} padding={16} navigationTitle="图标集文件" navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title="完成" action={dismiss}/>, primaryAction: <Button title="复制原文" action={copy}/> }}>
 <VStack alignment="leading" spacing={5} frame={{ maxWidth: Infinity }}><Text font="headline">{name}</Text><Text font="caption" foregroundStyle="secondaryLabel" textSelection>{url}</Text><Text font="caption" foregroundStyle="secondaryLabel">{updatedAt ? '本地快照 · ' + new Date(updatedAt).toLocaleString() : '本地快照'} · 只读</Text></VStack>
 <ScrollView><Text font={{ name: 'Menlo', size: 12 }} textSelection frame={{ maxWidth: Infinity, alignment: 'leading' }}>{rawText.slice(page * size, (page + 1) * size)}</Text></ScrollView>
 {pages > 1 ? <HStack spacing={20}><Button title="上一页" disabled={page === 0} action={() => setPage(page - 1)}/><Text font="caption">{page + 1} / {pages}</Text><Button title="下一页" disabled={page + 1 >= pages} action={() => setPage(page + 1)}/></HStack> : null}
 </VStack></NavigationStack>
}
