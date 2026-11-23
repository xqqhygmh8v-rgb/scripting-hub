import { HStack, Link, RoundedRectangle, Spacer, Text, VStack } from "scripting";
import { openurl } from "../../util/url";
import { toFlag } from "../../util/flag";

export function ItemView({ i }: { i: any }) {
  if (!i) return <RoundedRectangle cornerRadius={21} fill={"quaternarySystemFill"} />;
  const { id, region } = i;
  return (
    <Link url={openurl(id.toLowerCase())} buttonStyle={"plain"}>
      <RoundedRectangle
        fill={{
          color: "secondarySystemBackground",
          // color: "accentColor",
          gradient: true,
        }}
        cornerRadius={21}
        overlay={
          <VStack padding={11} alignment={"leading"}>
            <HStack>
              <Text font={"subheadline"} fontWeight={"medium"} padding={{ bottom: -1 }}>
                {toFlag(region)}
              </Text>
              <Spacer />
            </HStack>
            <Spacer />
            <Text font={"footnote"} fontWeight={"medium"} padding={{ bottom: -1 }}>
              {region}
            </Text>
          </VStack>
        }
      />
    </Link>
  );
}
