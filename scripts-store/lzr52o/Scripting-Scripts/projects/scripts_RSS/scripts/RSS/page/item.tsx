import {
  Button,
  HStack,
  Image,
  List,
  ProgressView,
  NavigationLink,
  Text,
  VStack,
  useEffect,
  useState,
  Navigation,
  Section,
} from "scripting";
import { loadRss } from "../util/rss";
import { ConfigItemProps } from "../util/config/type";
import { View as DetailView } from "./detail";
import { AiView } from "./comp/aiView";

export function View({ items }: { items: ConfigItemProps[] }) {
  return <StackView items={items} />;
}

function StackView({ items }: { items: ConfigItemProps[] }) {
  const [rss, setRss] = useState<any>([]);
  const [isLoad, setIsLoad] = useState<boolean>(true);

  function fetchRss() {
    setIsLoad(true);
    setRss([]);

    const tasks = items.map((i) =>
      loadRss(i.suburl).then((r) => {
        const mapped = r.items.map((item) => ({
          ...item,
          subTitle: i.title,
          subUrl: i.suburl,
          subImageUrl: i.imageUrl,
        }));

        setRss((prev: any) =>
          [...prev, ...mapped].sort(
            (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
          )
        );
      })
    );

    Promise.all(tasks).finally(() => setIsLoad(false));
  }

  useEffect(() => {
    fetchRss();
  }, []);

  return (
    <List
      // refreshable={refreshRss}
      toolbar={{
        topBarLeading: [
          <Button
            disabled={isLoad}
            action={() => {
              fetchRss();
            }}>
            {isLoad ? <ProgressView /> : <Image systemName={"arrow.trianglehead.clockwise"} />}
          </Button>,
        ],
        topBarTrailing: [
          <Button
            title={"AI总结"}
            systemImage={"apple.intelligence"}
            disabled={isLoad}
            action={() => {
              Navigation.present(<AiView data={rss} />);
            }}
          />,
        ],
      }}>
      <Section title={"新闻列表"}>
        {rss.map((item: any) => {
          return (
            <NavigationLink
              destination={<DetailView data={item} />}
              // animation={{
              //   animation: anim,
              //   value: item.url,
              // }}
            >
              <VStack alignment={"leading"}>
                <HStack>
                  <Image
                    imageUrl={item.subImageUrl}
                    clipShape={"circle"}
                    resizable={true}
                    frame={{ height: 14, width: 14 }}
                  />
                  <Text font={"subheadline"} lineLimit={1} foregroundStyle={"secondaryLabel"}>
                    {item.subTitle}
                  </Text>
                </HStack>
                <Text lineLimit={2} font={"headline"}>
                  {item.title}
                </Text>
              </VStack>
            </NavigationLink>
          );
        })}
      </Section>
    </List>
  );
}
