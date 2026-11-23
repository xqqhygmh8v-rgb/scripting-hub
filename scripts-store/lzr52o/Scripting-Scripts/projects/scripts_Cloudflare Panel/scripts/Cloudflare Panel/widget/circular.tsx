import { Text, Gauge, Image } from "scripting";
import { formatNumber } from "../util/format";

export function View({ all, pages, workers }: { all: number; pages: number; workers: number }) {
  const value = workers + pages;
  const remain = all - value;
  return (
    <Gauge
      gaugeStyle="accessoryCircular"
      min={0}
      max={all}
      value={value}
      tint={"tertiaryLabel"}
      label={<Image systemName={"cloud.fill"} foregroundStyle="secondaryLabel" />}
      currentValueLabel={<Text>{formatNumber(remain)}</Text>}
    />
  );
}
