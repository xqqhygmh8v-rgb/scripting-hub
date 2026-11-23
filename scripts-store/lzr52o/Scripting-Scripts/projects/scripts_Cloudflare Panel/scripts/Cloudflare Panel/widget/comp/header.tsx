import { HStack, Image, Link, Path, Script, Spacer, Text } from "scripting";

export function View() {
  return (
    <Link url={"https://dash.cloudflare.com"} buttonStyle={"plain"}>
      <HStack>
        <Image
          filePath={Path.join(Script.directory, "image/Workers.png")}
          resizable={true}
          scaleToFit={true}
          frame={{ width: 24, height: 24 }}
        />
        <Spacer />
        <Text font={"headline"} padding={{ top: -2 }}>
          {"Compute"}
        </Text>
      </HStack>
    </Link>
  );
}
