import { HStack, VStack } from "scripting";
import { ItemView } from "./comp/item";
import { regions } from "../class/region";

export function View() {
  const items: any = [...regions.countries.filter((i) => i.enabled).slice(0, 8)];
  while (items.length < 8) items.push(null);
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
      <HStack>
        <ItemView i={items[4]} />
        <ItemView i={items[5]} />
      </HStack>
      <HStack>
        <ItemView i={items[6]} />
        <ItemView i={items[7]} />
      </HStack>
    </VStack>
  );
}
