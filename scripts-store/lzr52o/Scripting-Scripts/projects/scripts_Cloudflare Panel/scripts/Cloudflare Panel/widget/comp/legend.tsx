import { HStack, Circle, Spacer, Text } from "scripting";
import type { Color } from "scripting";
import { orange, yellow } from "../../const/color";

export function View() {
  return (
    <HStack>
      <LegendItem color={orange} content={"Workers"} />
      <Spacer />
      <LegendItem color={yellow} content={"Pages"} />
    </HStack>
  );
}

function LegendItem({ color, content }: { color: Color; content: string }) {
  return (
    <HStack spacing={5} foregroundStyle={"secondaryLabel"} font={"caption"}>
      <Circle frame={{ height: 9 }} fill={color} />
      <Text>{content}</Text>
    </HStack>
  );
}
