import {
  Button,
  Group,
  List,
  Markdown,
  Menu,
  NavigationStack,
  Navigation,
  ProgressView,
  Text,
  useState,
  useEffect,
} from "scripting";
import { summarize } from "../../util/ai";

export function AiView({ data }: { data: object }) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <AiStackView
        data={data}
        navigationTitle={"AI总结"}
        toolbar={{
          topBarLeading: [<Button title={"退出"} systemImage={"xmark"} action={dismiss} />],
        }}
      />
    </NavigationStack>
  );
}

let lastData: any = null;
let lastContent: string | null = null;

function AiStackView({ data }: { data: object }) {
  const [content, setContent] = useState<string | null>(null);

  async function summarizeData() {
    if (lastData && JSON.stringify(lastData) === JSON.stringify(data)) {
      setContent(lastContent);
      return;
    }

    const result = await summarize(data);
    lastData = data;
    lastContent = result;
    setContent(result);
  }

  useEffect(() => {
    summarizeData();
  }, [data]);

  if (!content) return <ProgressView />;

  return (
    <List
      toolbar={{
        topBarTrailing: [
          <Menu title="导出" systemImage={"square.and.arrow.up"}>
            <Button
              title={"导出AI总结"}
              systemImage={"sparkle"}
              action={async () => {
                ShareSheet.present([content]);
              }}
            />
            <Button
              title={"导出新闻数据"}
              systemImage={"doc"}
              action={() => {
                ShareSheet.present([JSON.stringify(data)]);
              }}
            />
          </Menu>,
        ],
      }}>
      <Markdown
        content={content}
        contextMenu={{
          menuItems: (
            <Group>
              <Button
                title={"拷贝"}
                systemImage={"doc.on.doc"}
                action={async () => {
                  Pasteboard.setString(content);
                }}
              />
            </Group>
          ),
        }}
      />
    </List>
  );
}
