declare module 'scripting' {
  export type Color = string
  export type Node = unknown
  export type VirtualNode = any
  export type Alignment =
    | 'top'
    | 'center'
    | 'bottom'
    | 'leading'
    | 'trailing'
    | 'bottomLeading'
    | 'bottomTrailing'
    | 'topLeading'
    | 'topTrailing'
    | 'centerFirstTextBaseline'
    | 'centerLastTextBaseline'
    | 'leadingFirstTextBaseline'
    | 'leadingLastTextBaseline'
    | 'trailingFirstTextBaseline'
    | 'trailingLastTextBaseline'

  export type AppIntent<T> = {
    script: string
    name: string
    protocol: number
    params: T
  }

  export type AppIntentFactory<T> = (params: T) => AppIntent<T>

  export const AppIntentProtocol: {
    AppIntent: number
    AudioPlaybackIntent: number
    AudioRecordingIntent: number
    LiveActivityIntent: number
  }

  export const AppIntentManager: {
    register<T = undefined>(options: {
      name: string
      protocol: number
      perform: (params: T) => Promise<void>
    }): AppIntentFactory<T>
  }

  export const Script: { exit(): void }

  export const Navigation: {
    present(options: { element: unknown }): Promise<void>
    useDismiss(): () => void
  }

  export const Widget: {
    family: string
    displaySize: { width: number; height: number }
    parameter: string
    present(element: unknown, options?: unknown): void
    preview(options?: unknown): Promise<void>
    reloadAll(): void
  }

  export type FetchResponse = {
    ok: boolean
    status: number
    text(): Promise<string>
    json(): Promise<any>
  }

  export const fetch: (
    url: string,
    options?: Record<string, unknown>
  ) => Promise<FetchResponse>

  export function useState<T>(
    initial: T | (() => T)
  ): [T, (value: T | ((previous: T) => T)) => void]
  export function useEffect(effect: () => void, deps: unknown[]): void

  export const Button: (props: any) => any
  export const Circle: (props: any) => any
  export const ColorPicker: (props: any) => any
  export const HStack: (props: any) => any
  export const Image: (props: any) => any
  export const List: (props: any) => any
  export const NavigationStack: (props: any) => any
  export const Picker: (props: any) => any
  export const ProgressView: (props: any) => any
  export const Rectangle: (props: any) => any
  export const RoundedRectangle: (props: any) => any
  export const Section: (props: any) => any
  export const Slider: (props: any) => any
  export const Spacer: (props: any) => any
  export const ScrollView: (props: any) => any
  export const Text: (props: any) => any
  export const TextField: (props: any) => any
  export const Toggle: (props: any) => any
  export const VStack: (props: any) => any
  export const ZStack: (props: any) => any
}

declare const Dialog: {
  alert(options: {
    title?: string
    message: string
    buttonLabel?: string
  }): Promise<void>
  confirm(options: {
    title?: string
    message: string
    cancelLabel?: string
    confirmLabel?: string
  }): Promise<boolean>
}

declare const Storage: {
  get<T = unknown>(key: string, options?: { shared?: boolean }): T | null
  set<T>(key: string, value: T, options?: { shared?: boolean }): boolean
  remove(key: string, options?: { shared?: boolean }): void
  contains(key: string, options?: { shared?: boolean }): boolean
  clear(): void
  keys(): string[]
}

declare const console: {
  log(...args: any[]): void
  error(...args: any[]): void
  warn(...args: any[]): void
}

declare function setTimeout(handler: () => void, timeout?: number): number
declare function clearTimeout(id: number): void

declare namespace JSX {
  type Element = any
  interface IntrinsicAttributes {
    key?: string | number
  }
  interface IntrinsicElements {
    [name: string]: any
  }
}
