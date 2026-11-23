import {
  Button,
  ContentUnavailableView,
  HStack,
  Image,
  List,
  NavigationLink,
  ProgressView,
  RoundedRectangle,
  ScrollView,
  Section,
  Spacer,
  Text,
  useEffect,
  useObservable,
  VStack,
} from "scripting";
import { itunes } from "../class/itunes";
import { View as DetailView } from "./detail";

export function View() {
  const presented = useObservable(true);
  const query = useObservable("");
  const res = useObservable<any[] | null | undefined>();

  async function search() {
    try {
      res.setValue(null);
      await Promise.all(
        itunes.countries.filter((i) => i.enabled).map((i) => itunes.search(query.value, i.region)),
      ).then((r) => {
        if (!r) return;
        const all = r.flatMap((item) => item.results);

        const m = new Map();
        for (const i of all) {
          if (!m.has(i.trackId)) {
            m.set(i.trackId, i);
          }
        }

        res.setValue([...m.values()]);
      });
    } catch (e) {
      res.setValue(undefined);
    }
  }

  useEffect(() => {
    if (!presented.value) res.setValue(undefined);
  }, [presented.value]);

  return (
    <ContentView
      res={res.value}
      searchable={{ value: query, presented: presented }}
      onSubmit={{ triggers: "search", action: search }}
    />
  );
}

function ContentView({ res }: { res: any[] | null | undefined }) {
  return (
    <>
      {res === undefined ? (
        <></>
      ) : res === null ? (
        <ProgressView padding={true} title="正在搜索" />
      ) : res.length === 0 ? (
        <ScrollView>
          <HStack padding={true}>
            <Spacer />
            <ContentUnavailableView title="暂无搜索结果" systemImage="magnifyingglass" />
            <Spacer />
          </HStack>
        </ScrollView>
      ) : (
        <List>
          <Section title={"搜索结果"}>
            {res.map((info) => (
              <ItemView key={info.trackId} info={info} />
            ))}
          </Section>
        </List>
      )}
    </>
  );
}

function ItemView({ info }: { info: any }) {
  // if (!info.artworkUrl512) return <></>;
  return (
    <NavigationLink
      destination={
        <DetailView
          id={info.trackId}
          navigationTitle={info.trackName}
          navigationBarTitleDisplayMode={"inline"}
          toolbar={{
            topBarTrailing: [
              <Button
                title={"预览"}
                systemImage={"link"}
                action={() => AppStore.presentApp(info.trackId)}
              />,
            ],
          }}
        />
      }>
      <HStack>
        <IconView info={info} />
        <VStack alignment={"leading"} offset={{ x: 0, y: 4 }}>
          <Text font={"headline"} lineLimit={1}>
            {info.trackName}
          </Text>
          <Text font={"subheadline"} foregroundStyle={"secondaryLabel"} lineLimit={2}>
            {info.description}
          </Text>
          <Spacer />
        </VStack>
      </HStack>
    </NavigationLink>
  );
}

function IconView({ info }: { info: any }) {
  const icon = useObservable<UIImage | null>();

  async function init() {
    icon.setValue(await UIImage.fromURL(info.artworkUrl512));
  }
  useEffect(() => {
    init();
  }, []);

  if (icon.value === undefined) return <ProgressView frame={{ height: 64, width: 64 }} />;
  if (icon.value === null)
    return (
      <RoundedRectangle
        fill={"systemBackground"}
        cornerRadius={14}
        frame={{ height: 64, width: 64 }}
      />
    );
  return (
    <Image
      image={icon.value}
      resizable={true}
      frame={{ height: 64, width: 64 }}
      clipShape={{
        type: "rect",
        cornerRadius: 14,
        style: "continuous",
      }}
      contextMenu={{
        menuItems: (
          <>
            <Section title={"共享"}>
              <Button title={"插图"} action={() => ShareSheet.present([icon.value!])} />
            </Section>
            <Section title={"拷贝"}>
              <CopyButton contents={[info.artistName]} title={"艺人"} />
              <CopyButton contents={[info.price]} title={"价格"} />
              <CopyButton contents={[info.currency]} title={"货币符号"} />
              <CopyButton contents={[info.formattedPrice]} title={"格式化后的价格"} />
              <CopyButton contents={[info.releaseDate]} title={"发布日期"} />
              <CopyButton contents={info.genres} title={"类别"} />
              <CopyButton contents={[info.description]} title={"描述"} />
              <CopyButton contents={[info.averageUserRating]} title={"评分"} />
              <CopyButton
                contents={[info.averageUserRatingForCurrentVersion]}
                title={"此版本的评分"}
              />
              <CopyButton
                contents={[info.userRatingCountForCurrentVersion]}
                title={"此版本的评分数量"}
              />
              <CopyButton contents={[info.version]} title={"版本"} />
              <CopyButton contents={[info.currentVersionReleaseDate]} title={"上次更新"} />
              <CopyButton contents={[info.releaseNotes]} title={"发布说明"} />
              <CopyButton contents={[info.trackContentRating]} title={"内容分级"} />
              <CopyButton contents={[info.minimumOsVersion]} title={"操作系统最低版本"} />
              <CopyButton contents={info.features} title={"通用性"} />
              <CopyButton contents={[info.isGameCenterEnabled]} title={"是否支持Game Center"} />
              <CopyButton contents={info.supportedDevices} title={"支持的设备"} />
              <CopyButton contents={info.languageCodesISO2A} title={"支持的语言"} />
              <CopyButton contents={info.screenshotUrls} title={"截屏URL"} />
              <CopyButton contents={info.ipadScreenshotUrls} title={"iPad截屏URL"} />
              <CopyButton contents={[info.fileSizeBytes]} title={"下载大小"} />
              <CopyButton contents={[info.bundleId]} title={"捆绑包标识符"} />
              <CopyButton contents={[info.trackId]} title={"商店ID"} />
              <CopyButton contents={[info.trackViewUrl]} title={"商店URL"} />
              <CopyButton contents={[info.artworkUrl512]} title={"插图URL"} />
              <CopyButton contents={[info.trackName]} title={"名称"} />
            </Section>
          </>
        ),
      }}
    />
  );
}

function CopyButton({ contents, title }: { contents: string[]; title: string }) {
  return <Button title={title} action={() => Pasteboard.setStrings(contents)} />;
}
