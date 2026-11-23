import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { View as Header } from "./comp/header";
import { View as Legend } from "./comp/legend";
import { View as Progress } from "./comp/progress";

export function View({ all, pages, workers }: { all: number; pages: number; workers: number }) {
  return (
    <VStack padding={true}>
      <Header />
      <Divider padding={{ top: -2 }} />
      <HStack font={"caption"} fontWeight={"semibold"} padding={{ top: 2, bottom: 4 }}>
        <Text foregroundStyle={"secondaryLabel"}>{"Remain"}</Text>
        <Spacer />
        <Text foregroundStyle={"secondaryLabel"}>{all - workers - pages}</Text>
      </HStack>
      <Progress all={all} pages={pages} workers={workers} padding={{ top: -2 }} />
      <Legend fontWeight={"semibold"} />
    </VStack>
  );
}
