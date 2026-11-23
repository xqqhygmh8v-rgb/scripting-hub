import {
  ContentUnavailableView,
  HStack,
  Image,
  List,
  ProgressView,
  Rectangle,
  Section,
  Text,
  useEffect,
  useObservable,
  VStack,
} from "scripting"
import { app } from "../util/itunes"
import { View as UploadView } from "./upload"

export function View() {
  const query = useObservable<string>("")
  const res = useObservable<any[] | null>()
  const presented = useObservable(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.value) return

      res.setValue(null) // 加载动画

      Promise.all(app.enabledCountries.map((c) => app.search(query.value, c, 3))).then((r) => {
        const all = r.flatMap((item) => item.results)

        const m = new Map()
        for (const i of all) {
          if (!m.has(i.trackId)) {
            m.set(i.trackId, i)
          }
        }
        const unique = [...m.values()]

        res.setValue(unique)
      })
    }, 800)

    return () => clearTimeout(timer)
  }, [query.value])

  return (
    <VStack searchable={{ value: query, presented: presented }}>
      {res.value === undefined ? (
        <></>
      ) : res.value === null ? (
        <ProgressView />
      ) : res.value.length === 0 ? (
        <ContentUnavailableView title="暂无搜索结果" systemImage="magnifyingglass" />
      ) : (
        <List>
          <Section title={"搜索结果"}>
            {res.value.map((i: any) => (
              <AppView data={i} />
            ))}
          </Section>
        </List>
      )}
    </VStack>
  )
}

function AppView({ data }: { data: any }) {
  const isPresented = useObservable(false)
  const img = useObservable<UIImage | null>(null)

  useEffect(() => {
    UIImage.fromURL(data.artworkUrl512).then((i) => {
      if (!i) return
      img.setValue(i)
    })
  }, [])

  return (
    <HStack
      onTapGesture={() => isPresented.setValue(true)}
      sheet={img.value ? {
        isPresented: isPresented,
        content: <UploadView img={img.value!} url={data.artworkUrl512} filename={data.trackName} presentationDetents={["medium", "large"]} />,
      } : undefined}>
      <Rectangle frame={{ height: 44, width: 44 }} hidden={true} overlay={
        <>
          {img ? (
            <Image
              image={img.value!}
              resizable={true}
              frame={{ height: 44, width: 44 }}
              clipShape={{
                type: "rect",
                cornerRadius: 12,
              }}
            />
          ) : (
            <ProgressView />
          )}
        </>
      } />
      <VStack alignment={"leading"} lineLimit={1}>
        <Text font={"headline"}>{data.trackName}</Text>
        <Text font={"subheadline"} foregroundStyle={"secondaryLabel"}>
          {data.artistName}
        </Text>
      </VStack>
    </HStack>
  )
}
