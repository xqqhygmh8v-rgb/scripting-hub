import { HStack, Rectangle, Spacer, Text, ZStack } from "scripting";
import { orange, yellow } from "../../const/color";

export function View({ all, pages, workers }: { all: number; pages: number; workers: number }) {
  const cornerRadius = 13;
  return (
    <ZStack alignment={"leading"}>
      <Rectangle
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "rect",
          cornerRadius: cornerRadius,
        }}
        overlay={
          <Rectangle
            fill={{
              gradient: true,
              color: yellow,
            }}
            scaleEffect={{
              x: (workers + pages) / all,
              y: 1,
              anchor: "leading",
            }}
            clipShape={{
              type: "rect",
              cornerRadius: cornerRadius,
            }}
            overlay={
              <Rectangle
                fill={{
                  gradient: true,
                  color: orange,
                }}
                scaleEffect={{
                  x: workers / all,
                  y: 1,
                  anchor: "leading",
                }}
                clipShape={{
                  type: "rect",
                  cornerRadius: cornerRadius,
                }}
              />
            }
          />
        }
      />
      <HStack>
        <Spacer />
        <Text
          font={"headline"}
          padding={{ trailing: 9 }}
          monospacedDigit={true}
          // foregroundStyle={"secondaryLabel"}
        >{`${(((workers + pages) / all) * 100).toFixed(0)}%`}</Text>
      </HStack>
    </ZStack>
  );
}
