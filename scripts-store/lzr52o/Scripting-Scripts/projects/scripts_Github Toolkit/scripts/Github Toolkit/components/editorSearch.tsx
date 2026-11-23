import { ThemeCardBackground } from "./themePalette";
// 編輯器搜尋（共用）：Gist 編輯器、Repo 編輯器都用同一支。
// 搜尋用彈出頁（Navigation.present），不要塞在編輯器上面——編輯器
// 一定要全螢幕直接放在 NavigationStack／根目錄，包進 VStack 會
// 讓它一直轉圈圈、內容出不來（1.4.0 的教訓，已改回 1.3.0 的寫法）。
// 彈出頁蓋住編輯器，所以打字只更新筆數、不跳；點上一個／下一個／
// 某個符合處才跳過去（setSelection）並關掉彈出頁，讓使用者直接
// 看到反白的符合處。查詢字串跟目前第幾個會記住，下次打開繼續。
import { Button, HStack, Image, List, Navigation, NavigationStack, Rectangle, Section, Spacer, Text, TextField, useEffect, useMemo, useState } from "scripting";
import { t } from "./i18n";
import { CARD_BACKGROUND } from "./theme";
import { GlassBackground } from "./glass";

export type EditorSearchMatch = { start: number; end: number; line: number };

// 自己算符合處（searchText 不可用時的退路）：不分大小寫找全部。
// line 是符合處起始行（1-based）。from 只往前走，整份內容只掃一次。
export function findMatchesInContent(content: string, query: string): EditorSearchMatch[] {
  if (!query) return [];
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  const out: EditorSearchMatch[] = [];
  let from = 0;
  let line = 1;
  const advanceTo = (pos: number) => {
    for (let k = from; k < pos; k++) if (content[k] === "\n") line++;
    from = pos;
  };
  while (true) {
    const i = lower.indexOf(q, from);
    if (i < 0) break;
    advanceTo(i);
    out.push({ start: i, end: i + query.length, line });
    advanceTo(i + query.length);
  }
  return out;
}

// 取出符合處那一行的文字（給搜尋結果清單顯示），太長就截斷。
export function getMatchLineText(content: string, m: EditorSearchMatch): string {
  const lineStart = content.lastIndexOf("\n", m.start - 1) + 1;
  let lineEnd = content.indexOf("\n", m.end);
  if (lineEnd < 0) lineEnd = content.length;
  let line = content.slice(lineStart, lineEnd).trim();
  if (line.length > 80) line = line.slice(0, 80) + "…";
  return line;
}

// 工具列上的放大鏡：點一下打開搜尋彈出頁。
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button action={onOpen}>
      <Image systemName={"magnifyingglass"} />
    </Button>
  );
}

// 搜尋彈出頁。用 Navigation.present 打開；關掉時回傳目前的查詢
// 字串跟第幾個，讓上層記住、下次打開繼續。
export function EditorSearchSheet({
  controller,
  initialQuery,
  initialIndex,
}: {
  controller: EditorController;
  initialQuery: string;
  initialIndex: number;
}) {
  const dismiss = Navigation.useDismiss();
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState<EditorSearchMatch[]>([]);
  const [index, setIndex] = useState(initialIndex);
  const gen = useMemo(() => ({ n: 0 }), []);

  // 只更新清單跟筆數、不跳（彈出頁蓋住編輯器，跳了也看不到）。
  async function runSearch(q: string) {
    const myGen = ++gen.n;
    if (!q) {
      setMatches([]);
      setIndex(0);
      return;
    }
    let found: EditorSearchMatch[];
    try {
      const fn = (controller as any).searchText;
      if (typeof fn === "function") {
        found = await fn.call(controller, q, { caseSensitive: false });
      } else {
        found = findMatchesInContent(controller.content, q);
      }
    } catch (e) {
      found = findMatchesInContent(controller.content, q);
    }
    if (myGen !== gen.n) return;
    setMatches(found);
    setIndex((prev) => (found.length === 0 ? 0 : Math.min(prev, found.length - 1)));
  }

  function jumpTo(i: number) {
    if (matches.length === 0) return;
    const m = matches[i];
    if (!m) return;
    const fn = (controller as any).setSelection;
    if (typeof fn === "function") fn.call(controller, m.start, m.end);
    dismiss({ query, index: i });
  }

  function goTo(delta: number) {
    if (matches.length === 0) return;
    const i = (index + delta + matches.length) % matches.length;
    jumpTo(i);
  }

  // 查詢字串一改，防抖 150ms 後搜尋。打開時也會跑一次（沿用上次的查詢字串）。
  useEffect(() => {
    const timer = setTimeout(() => { runSearch(query); }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const countText = !query
    ? ""
    : matches.length > 0
      ? `${index + 1} / ${matches.length}`
      : t("無結果", "无结果", "No results");

  return (
    <NavigationStack>
      <List
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={t("搜尋", "搜索", "Search")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          cancellationAction: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss({ query, index })} />],
        }}
      >
        <Section>
          <TextField
            listRowBackground={<ThemeCardBackground />}
            title={t("搜尋", "搜索", "Search")}
            value={query}
            onChanged={setQuery}
            prompt={t("輸入要搜尋的文字", "输入要搜索的文字", "Enter text to search")}
          />
          <HStack>
            <Text>{countText}</Text>
            <Spacer />
            <Button action={() => goTo(-1)} disabled={matches.length === 0}>
              <Image systemName={"chevron.up"} />
            </Button>
            <Button action={() => goTo(1)} disabled={matches.length === 0}>
              <Image systemName={"chevron.down"} />
            </Button>
          </HStack>
        </Section>
        <Section>
          {matches.map((m, i) => (
            <Button
              key={`${m.start}-${m.end}`}
              listRowBackground={<ThemeCardBackground />}
              action={() => jumpTo(i)}
            >
              <HStack>
                <Text>{t(`第 ${m.line} 行`, `第 ${m.line} 行`, `Line ${m.line}`)}</Text>
                <Text lineLimit={1}>{getMatchLineText(controller.content, m)}</Text>
              </HStack>
            </Button>
          ))}
        </Section>
      </List>
    </NavigationStack>
  );
}
