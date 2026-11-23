import {
  NavigationStack,
  HStack,
  List,
  Text,
  Image,
  Button,
  Section,
  useState,
  Navigation,
  TextField,
  ProgressView,
  createContext,
  useSelector,
  VStack,
} from "scripting";
import { loadRss } from "../util/rss";
import { getIcon } from "../util/icon";
import { ConfigItemProps } from "../util/config/type";

let globalInput = "";
let globalData: any = null;

const DataContext = createContext<any>();
function DataProvider({ children }: { children: JSX.Element }) {
  const [data, setData] = useState({
    detail: null,
    icon: null,
  });
  return <DataContext.Provider value={{ data, setData }}>{children}</DataContext.Provider>;
}

export function View({ value }: { value?: string }) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <List
        navigationTitle="编辑RSS源"
        scrollDisabled={true}
        toolbar={{
          topBarLeading: [<Button title={"取消"} systemImage={"xmark"} action={dismiss} />],
          topBarTrailing: [
            <Button
              title={"保存"}
              systemImage={"checkmark"}
              action={() => {
                if (globalData) {
                  dismiss(globalData);
                } else {
                  Dialog.alert({
                    title: "提示",
                    message: "未获取到RSS信息",
                  });
                }
              }}
            />,
          ],
        }}>
        <DataProvider>
          <ContentView value={value} />
        </DataProvider>
      </List>
    </NavigationStack>
  );
}

function ContentView({ value }: { value?: string }) {
  globalInput = value || "";

  return (
    <>
      <Section title="订阅链接">
        <HStack>
          <InputView value={value} />
          <SearchButtonContainer />
        </HStack>
      </Section>
      <PreView />
    </>
  );
}

function PreView() {
  const { detail, icon } = useSelector(DataContext, (ctx) => ctx.data);

  // console.log(detail.items.slice(0, 3));

  return (
    <>
      {detail && typeof detail === "object" ? (
        <>
          <Section title="预览">
            <HStack>
              <IconView url={icon || ""} />
              <Text bold lineLimit={1}>
                {detail.title}
              </Text>
            </HStack>
          </Section>
          <Section title="内容">
            {/* {detail.items.slice(0, 1).map((i: any) => {
              return (
                <VStack alignment={"leading"}>
                  <Text font={"headline"} lineLimit={1}>
                    {i.title}
                  </Text>
                  <Text
                    font={"subheadline"}
                    foregroundStyle={"secondaryLabel"}
                    lineLimit={3}>
                    {i.content}
                  </Text>
                </VStack>
              );
            })} */}
            <VStack alignment={"leading"}>
              <Text font={"headline"} lineLimit={1}>
                {detail.items[0].title}
              </Text>
              <Text font={"subheadline"} foregroundStyle={"secondaryLabel"} lineLimit={3}>
                {detail.items[0].content}
              </Text>
            </VStack>
          </Section>
        </>
      ) : typeof detail === "string" ? (
        <Section title="错误">
          <Text>{detail}</Text>
        </Section>
      ) : undefined}
    </>
  );
}

function IconView({ url }: { url: string }) {
  const imageSize = 24;
  return (
    <Image
      placeholder={<ProgressView />}
      clipShape={"rect"}
      imageUrl={url}
      resizable
      frame={{
        width: imageSize,
        height: imageSize,
      }}
    />
  );
}

function InputView({ value }: { value?: string }) {
  const [input, setInput] = useState(value || "");

  return (
    <TextField
      contextMenu={{
        menuItems: (
          <Button
            title={"拷贝"}
            systemImage={"doc.on.doc"}
            action={() => {
              Pasteboard.setString(input);
            }}
          />
        ),
      }}
      title="请输入订阅链接"
      value={input}
      axis={"vertical"}
      lineLimit={{ max: 5 }}
      onChanged={(val) => {
        setInput(val);
        globalInput = val;
      }}
    />
  );
}

function SearchButtonContainer() {
  const setData = useSelector(DataContext, (ctx) => ctx.setData);
  return <SearchButtonView setData={setData} />;
}

function SearchButtonView({ setData }: { setData: any }) {
  const [loading, setLoading] = useState(false);
  const bottonSize = 13;
  return (
    <>
      {loading ? (
        <ProgressView frame={{ width: bottonSize, height: bottonSize }} />
      ) : (
        <Button
          frame={{ width: bottonSize, height: bottonSize }}
          contentShape={"circle"}
          action={async () => {
            if (!globalInput.startsWith("http")) {
              await Dialog.alert({
                title: "提示",
                message: "请输入有效链接",
              });
              return;
            }

            setLoading(true);
            globalData = null;
            try {
              const res = await loadRss(globalInput);
              const iconUrl = await getIcon(res.link);

              globalData = {
                title: res.title,
                url: res.link,
                suburl: globalInput,
                imageUrl: iconUrl,
              } as ConfigItemProps;

              setData({
                detail: res,
                icon: iconUrl || "",
              });
            } catch (e) {
              console.log(e);
            }
            setLoading(false);
          }}>
          <Image systemName="magnifyingglass" fontWeight={"semibold"} />
        </Button>
      )}
    </>
  );
}
