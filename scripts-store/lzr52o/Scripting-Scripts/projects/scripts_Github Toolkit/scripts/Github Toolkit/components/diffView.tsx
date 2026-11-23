import { HStack, VStack, ScrollView, Text } from "scripting";
import { ThemeCardBackground, useThemePalette } from "./themePalette";
import { DiffLine } from "./diff";

// Same addition/deletion/hunk colors as the repository PR viewer.
export function DiffFileView({ filename, status, additions, deletions, lines }: {
  filename: string; status: string; additions: number; deletions: number; lines: DiffLine[];
}) {
  const { muted } = useThemePalette();
  const width = Math.max(320, ...lines.map(line => Math.min(2000, line.text.length) * 6.5 + 116));
  return <VStack alignment="leading" spacing={6} listRowBackground={<ThemeCardBackground />}>
    <Text font={13} fontWeight="semibold" textSelection>{filename}</Text>
    <HStack spacing={8}>
      <Text font={11} foregroundStyle={muted}>{status}</Text>
      <Text font={11} foregroundStyle="systemGreen">{`+${additions}`}</Text>
      <Text font={11} foregroundStyle="systemRed">{`−${deletions}`}</Text>
    </HStack>
    <ScrollView axes="horizontal">
      <VStack alignment="leading" spacing={0}>
        {lines.map((line, index) => {
          const colors: readonly [`#${string}`, `#${string}`] = line.kind === "add" ? ["#173B2B", "#B7E4C7"] : line.kind === "delete" ? ["#482628", "#FFB4AE"] : line.kind === "hunk" ? ["#1C3455", "#A9C8FF"] : ["#22282D", "#CBD1D7"];
          return <HStack key={index} spacing={6} padding={{ horizontal: 6, vertical: 2 }} frame={{ width, alignment: "leading" }} background={colors[0]}>
            <Text font={10} monospaced foregroundStyle={colors[1]} frame={{ width: 34, alignment: "trailing" }}>{line.oldLine ?? ""}</Text>
            <Text font={10} monospaced foregroundStyle={colors[1]} frame={{ width: 34, alignment: "trailing" }}>{line.newLine ?? ""}</Text>
            <Text font={10} monospaced foregroundStyle={colors[1]} frame={{ width: 10 }}>{line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " "}</Text>
            <Text font={10} monospaced foregroundStyle={colors[1]} textSelection fixedSize={{ horizontal: true, vertical: true }}>{line.text || " "}</Text>
          </HStack>;
        })}
      </VStack>
    </ScrollView>
  </VStack>;
}
