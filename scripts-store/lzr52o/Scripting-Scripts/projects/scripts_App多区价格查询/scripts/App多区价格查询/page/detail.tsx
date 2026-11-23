import {
  Button,
  ContentUnavailableView,
  DisclosureGroup,
  HStack,
  List,
  ProgressView,
  Section,
  Spacer,
  Text,
  useEffect,
  useObservable,
  VStack,
} from "scripting";
import { itunes } from "../class/itunes";
import { web } from "../class/web";
import { rates } from "../class/rate";
import { formatPrice } from "../util/format";

export function View({ id }: { id: string }) {
  const res = useObservable<any[] | string>();

  async function search() {
    try {
      await Promise.all([
        rates.init(),
        Promise.all(
          itunes.countries
            .filter((i) => i.enabled)
            .map(async (i) => {
              const region = i.region.toLowerCase();
              const [price, inapp] = await Promise.all([
                itunes.lookup(id, region),
                web.price(id, region),
              ]);

              const [r] = price.results;
              return {
                price: r.formattedPrice,
                inapp: inapp.inapp,
              };
            }),
        ).then((r) => {
          res.setValue(r);
        }),
      ]);
    } catch (e) {
      res.setValue(String(e));
    }
  }

  useEffect(() => {
    search();
  }, []);

  if (!res.value) return <ProgressView />;
  return (
    <ContentView
      appId={id}
      info={res.value}
      refreshable={async () => {
        await Promise.all([search(), new Promise((r: any) => setTimeout(r, 500))]);
      }}
    />
  );
}

function ContentView({ appId, info }: { appId: string; info: any[] | string }) {
  if (typeof info === "string") {
    return (
      <ContentUnavailableView title={"错误"} systemImage={"magnifyingglass"} description={info} />
    );
  }

  return (
    <List>
      {itunes.countries
        .filter((i) => i.enabled)
        .map((i, index) => (
          <PriceView key={i.region + appId} region={i.region} index={index} info={info} />
        ))}
    </List>
  );
}

function PriceView({ region, index, info }: { region: string; index: number; info: any[] }) {
  return (
    <Section title={region}>
      {info[index].price === "" ? (
        <Text font={"headline"} foregroundStyle={"tertiaryLabel"}>
          {"App不可用"}
        </Text>
      ) : (
        <AppAvailableView index={index} info={info} region={region} />
      )}
    </Section>
  );
}

function AppAvailableView({ index, info, region }: { index: number; info: any[]; region: string }) {
  return (
    <>
      <HStack font={"headline"}>
        <Text>{"价格"}</Text>
        <Spacer />
        <AppPriceView price={info[index].price.split(" ")[0]} region={region} />
      </HStack>
      <InAppPurchase inapp={info[index].inapp} region={region} />
    </>
  );
}

function AppPriceView({ price, region }: { price: string; region: string }) {
  const p = useObservable<String>();

  async function init() {
    p.setValue(await formatPrice(price, region));
  }

  useEffect(() => {
    init();
  }, []);

  if (p.value === undefined) return <></>;
  return (
    <>
      {/* <Text foregroundStyle={"secondaryLabel"}>{`${p.value || "N/A"}`}</Text> */}
      {p.value == "" ? (
        <Text
          foregroundStyle={"secondaryLabel"}
          font={"subheadline"}
          contextMenu={{
            menuItems: (
              <Button
                disabled={!price}
                title="拷贝"
                systemImage={"doc.on.doc"}
                action={() => Pasteboard.setString(price)}
              />
            ),
          }}>
          {price}
        </Text>
      ) : (
        <VStack
          alignment={"trailing"}
          font={"subheadline"}
          contextMenu={{
            menuItems: (
              <Button
                disabled={!price}
                title="拷贝"
                systemImage={"doc.on.doc"}
                action={() => Pasteboard.setString(`${price} ≈ ${p.value}`)}
              />
            ),
          }}>
          <Text foregroundStyle={"secondaryLabel"}>{price}</Text>
          {p.value ? <Text foregroundStyle={"secondaryLabel"}>{String(p.value)}</Text> : null}
        </VStack>
      )}
    </>
  );
}

function InAppPurchase({ inapp, region }: { inapp: any[]; region: string }) {
  if (!inapp.length) return <></>;
  const expanded = useObservable(true);
  return (
    <DisclosureGroup
      isExpanded={expanded}
      title={"App内购买"}
      font={"headline"}
      contextMenu={{
        menuItems: (
          <Button
            title="拷贝"
            action={() => {
              Pasteboard.setString(inapp.map((j: any) => `${j.membership} ${j.price}`).join("\n"));
            }}
          />
        ),
      }}>
      {inapp.map((j: any) => (
        <InAppPurchaseItem key={j.membership} j={j} region={region} />
      ))}
    </DisclosureGroup>
  );
}

function InAppPurchaseItem({ j, region }: { j: any; region: string }) {
  const p = useObservable<String>();

  async function init() {
    const r = await formatPrice(j.price, region);
    console.log(r);
    p.setValue(r);
  }

  useEffect(() => {
    init();
  }, []);

  if (p.value === undefined) return <></>;
  return (
    <HStack>
      <Text font={"headline"}>{j.membership}</Text>
      <Spacer />
      {p.value == "" ? (
        <Text foregroundStyle={"secondaryLabel"} font={"subheadline"}>
          {j.price}
        </Text>
      ) : (
        <VStack alignment={"trailing"} font={"subheadline"}>
          <Text foregroundStyle={"secondaryLabel"}>{j.price}</Text>
          <Text foregroundStyle={"secondaryLabel"}>{String(p.value)}</Text>
        </VStack>
      )}
    </HStack>
  );
}
