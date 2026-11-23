import { Button, Text, useRef, useEffect } from 'scripting'
export default function GroupChip({ name, selected, onSelect, onRename, onReorder, onDelete }: { name: string; selected: boolean; onSelect: () => void; onRename?: () => void; onReorder?: () => void; onDelete?: () => void }) {
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
 const suppressTapUntil = useRef(0)
 useEffect(() => () => { if (timer.current != null) clearTimeout(timer.current) }, [])
 function afterMenu(action: () => void) {
  if (timer.current != null) return
  suppressTapUntil.current = Date.now() + 700
  // Allow the native context menu to dismiss before presenting another modal.
  timer.current = setTimeout(() => { timer.current = null; action() }, 350)
 }
 return <Button buttonStyle="plain" action={() => { if (Date.now() >= suppressTapUntil.current) onSelect() }} contextMenu={onRename && onReorder && onDelete ? {
  menuItems: <><Button title={`重命名「${name}」`} systemImage="pencil" action={() => afterMenu(onRename)}/><Button title="调整分组顺序" systemImage="arrow.up.arrow.down" action={() => afterMenu(onReorder)}/><Button title={`删除「${name}」`} systemImage="trash" role="destructive" action={() => afterMenu(onDelete)}/></>
 } : undefined}><Text font="subheadline" foregroundStyle={selected ? 'white' : '#5965DE'} padding={10} background={{ style: selected ? '#5965DE' : '#EEF0FC', shape: 'capsule' }}>{name}</Text></Button>
}
