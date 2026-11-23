import { Navigation, NavigationStack, List, Section, ForEach, Text, Button, useObservable } from 'scripting'
export type OrderItem = { id: string; title: string }
export default function OrderView({ title, items, note, onSave }: { title: string; items: OrderItem[]; note: string; onSave: (ids: string[]) => void }) {
 const dismiss = Navigation.useDismiss()
 const draft = useObservable<OrderItem[]>(() => items.map(x => ({ ...x })))
 const mode = useObservable(() => EditMode.active())
 function commit() {
  try { onSave(draft.value.map(x => x.id)); dismiss() }
  catch (e) { void Dialog.alert({ title: '无法保存排序', message: String(e instanceof Error ? e.message : e) }) }
 }
 return <NavigationStack><List environments={{ editMode: mode }} navigationTitle={title} navigationBarTitleDisplayMode="inline" toolbar={{ cancellationAction: <Button title="取消" action={dismiss}/>, confirmationAction: <Button title="保存" action={commit}/> }}>
 <Section header={<Text>拖动右侧手柄调整顺序</Text>} footer={<Text>{note} 仅点击保存后生效。</Text>}>
 <ForEach data={draft} editActions="move" builder={item => <Text key={item.id}>{item.title}</Text>}/>
 </Section>
 </List></NavigationStack>
}
