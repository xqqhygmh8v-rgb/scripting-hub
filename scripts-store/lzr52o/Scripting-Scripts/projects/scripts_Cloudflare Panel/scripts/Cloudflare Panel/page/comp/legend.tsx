import { HStack, Circle, Spacer, Text, VStack } from "scripting";
import { orange, yellow } from "../../const/color";

export function View({ all, pages, workers }: { all: number; pages: number; workers: number }) {
  return (
    <HStack
      foregroundStyle={"secondaryLabel"}
      monospacedDigit={true}
      spacing={17}
      alignment={"top"}>
      <VStack alignment={"leading"}>
        <HStack>
          <Circle frame={{ height: 9 }} fill={orange} />
          <Text>{"Workers: " + workers}</Text>
        </HStack>
        <HStack>
          <Circle frame={{ height: 9 }} fill={yellow} />
          <Text>{"Pages: " + pages}</Text>
        </HStack>
      </VStack>
      <Spacer />
      <HStack>
        <Circle frame={{ height: 9 }} fill={"tertiarySystemFill"} />
        <Text>{"Remain: " + (all - workers - pages)}</Text>
      </HStack>
    </HStack>
  );
}
