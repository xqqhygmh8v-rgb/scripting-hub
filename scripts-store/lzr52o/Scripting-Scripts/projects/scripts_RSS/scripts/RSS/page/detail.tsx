import {
  Markdown,
  ScrollView,
  Text,
  VStack,
  Button,
  Navigation,
  Group,
  HStack,
  Spacer,
  modifiers,
} from "scripting";
import { RssItemProps } from "../util/rss/types";
import { AiView } from "./comp/aiView";

export function View({ data }: { data: RssItemProps | null }) {
  if (!data) return null;
  return (
    <ScrollView
      toolbar={{
        topBarTrailing: [
          // <Button
          //   title={"在浏览器打开"}
          //   systemImage={"safari"}
          //   action={() => Safari.openURL(data.link || "")}
          // />,
          <Button
            title={"AI总结"}
            systemImage={"apple.intelligence"}
            action={() => {
              Navigation.present(<AiView data={data} />);
            }}
          />,
        ],
      }}>
      <VStack
        alignment={"leading"}
        padding={{ leading: 6, trailing: 6 }}
        modifiers={modifiers().padding()}>
        <HStack>
          <VStack
            alignment={"leading"}
            contextMenu={{
              menuItems: (
                <Group>
                  <Button
                    title={"在浏览器打开"}
                    systemImage={"safari"}
                    action={() => {
                      if (data.link) {
                        Safari.openURL(data.link);
                      } else {
                        Dialog.alert({
                          title: "提示",
                          message: "该文章没有链接",
                        });
                      }
                    }}
                  />
                  <Button
                    title={"拷贝"}
                    systemImage={"doc.on.doc"}
                    action={() => {
                      Pasteboard.setString(data.title + data.pubDate || "");
                    }}
                  />
                </Group>
              ),
            }}>
            <Text font={"largeTitle"} fontWeight={"semibold"}>
              {data.title || ""}
            </Text>
            <Text
              bold
              font={"subheadline"}
              foregroundStyle={"secondaryLabel"}
              padding={{ bottom: true }}>
              {data.pubDate || ""}
            </Text>
          </VStack>
          <Spacer />
        </HStack>
        <Markdown content={data.content || ""} />
      </VStack>
    </ScrollView>
  );
}
