import { VStack } from "scripting";
import { ItemView } from "./comp/item";
import { regions } from "../class/region";

export function View() {
  const items: any = [...regions.countries.filter((i) => i.enabled).slice(0, 2)];
  while (items.length < 2) items.push(null);
  return (
    <VStack padding={8}>
      <ItemView i={items[0]} />
      <ItemView i={items[1]} />
    </VStack>
  );
}
