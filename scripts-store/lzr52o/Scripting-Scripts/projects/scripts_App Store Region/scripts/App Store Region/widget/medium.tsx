import { HStack, VStack } from "scripting";
import { ItemView } from "./comp/item";
import { regions } from "../class/region";

export function View() {
  const items: any = [...regions.countries.filter((i) => i.enabled).slice(0, 4)];
  while (items.length < 4) items.push(null);
  return (
    <VStack padding={8}>
      <HStack>
        <ItemView i={items[0]} />
        <ItemView i={items[1]} />
      </HStack>
      <HStack>
        <ItemView i={items[2]} />
        <ItemView i={items[3]} />
      </HStack>
    </VStack>
  );
}
