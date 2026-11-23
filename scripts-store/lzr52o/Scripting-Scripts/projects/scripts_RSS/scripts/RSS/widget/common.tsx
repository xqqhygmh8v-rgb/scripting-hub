import { Divider, Spacer, Text, VStack, HStack, Widget } from "scripting";
import { ReloadButton } from "./comp/reload";

export function View({ title, content }: { title: string; content: string }) {
  return (
    <VStack padding alignment={"leading"}>
      <HStack>
        <Text font={"headline"} bold lineLimit={1}>
          {title}
        </Text>
        <Spacer />
        <ReloadButton />
      </HStack>
      <Divider padding={{ top: -4 }} />
      <Text minScaleFactor={0.7} foregroundStyle={"secondaryLabel"}>
        {content}
      </Text>
      <Spacer />
    </VStack>
  );
}
