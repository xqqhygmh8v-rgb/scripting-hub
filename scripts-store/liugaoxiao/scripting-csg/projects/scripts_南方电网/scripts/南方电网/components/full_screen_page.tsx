import {
  Button,
  Navigation,
  type VirtualNode,
} from "scripting"

const SYSTEM_BLUE = "#0A84FF"

export function presentFullScreen<T = any>(element: VirtualNode) {
  return Navigation.present<T>({
    element,
    modalPresentationStyle: "fullScreen",
  })
}

export function PrimaryButton(props: {
  title: string
  systemImage: string
  action: () => void | Promise<void>
  disabled?: boolean
}) {
  return <Button
    title={props.title}
    systemImage={props.systemImage}
    action={props.action}
    disabled={props.disabled}
    buttonStyle="glassProminent"
    tint={SYSTEM_BLUE}
    frame={{ minHeight: 46, maxWidth: "infinity" }}
  />
}
