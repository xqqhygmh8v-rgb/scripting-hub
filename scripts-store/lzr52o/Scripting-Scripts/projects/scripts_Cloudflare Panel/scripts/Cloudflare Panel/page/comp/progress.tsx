import { Rectangle, VStack } from "scripting";
import { orange, yellow } from "../../const/color";

export function View({ all, pages, workers }: { all: number; pages: number; workers: number }) {
  return (
    <VStack alignment={"leading"}>
      <Rectangle
        frame={{ height: 24 }}
        fill={"tertiarySystemFill"}
        clipShape={{
          type: "capsule",
          style: "continuous",
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
              type: "capsule",
              style: "continuous",
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
                  type: "capsule",
                  style: "continuous",
                }}
              />
            }
          />
        }
      />
    </VStack>
  );
}
