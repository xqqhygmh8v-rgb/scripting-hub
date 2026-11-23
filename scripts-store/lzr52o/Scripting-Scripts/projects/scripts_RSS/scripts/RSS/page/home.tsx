import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationLink,
  Section,
  Spacer,
  Text,
  useState,
} from "scripting";
import { View as ItemView } from "./item";
import { View as AddView } from "./edit";
import { getConfig, setConfig } from "../util/config";

const iconSize = 25;
export function View() {
  const [source, setSource] = useState(getConfig());
  return (
    <List
      navigationTitle={"RSS"}
      // toolbar={{
      //   topBarTrailing: [
      //     <Button
      //       title={"添加"}
      //       systemImage={"plus"}
      //       action={async () => {
      //         const res = await Navigation.present({
      //           element: <AddView />,
      //         });
      //         if (res) {
      //           const newArr = [...source];
      //           const existIndex = newArr.findIndex((i) => i.suburl === res.suburl);

      //           if (existIndex !== -1) {
      //             newArr[existIndex] = res; // 已存在则替换
      //           } else {
      //             newArr.push(res); // 不存在则新增
      //           }
      //           const newData = newArr.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
      //           setConfig(newData);
      //           setSource(newData);
      //         }
      //       }}
      //     />,
      //   ],
      // }}
    >
      <NavigationLink
        destination={
          <ItemView
            navigationTitle={"全部"}
            navigationBarTitleDisplayMode={"inline"}
            items={[...source]}
          />
        }>
        <HStack>
          <Image
            systemName={"dot.radiowaves.up.forward"}
            imageScale={"large"}
            foregroundStyle={"accentColor"}
            frame={{ width: iconSize, height: iconSize }}
          />
          <Text bold>{"全部"}</Text>
        </HStack>
      </NavigationLink>
      <Section
        // title={"Feeds"}
        header={
          <HStack>
            <Text>Feeds</Text>
            <Spacer />
            <Button
              action={async () => {
                const res = await Navigation.present({
                  element: <AddView />,
                });
                if (res) {
                  const newArr = [...source];
                  const existIndex = newArr.findIndex((i) => i.suburl === res.suburl);

                  if (existIndex !== -1) {
                    newArr[existIndex] = res; // 已存在则替换
                  } else {
                    newArr.push(res); // 不存在则新增
                  }
                  const newData = newArr.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
                  setConfig(newData);
                  setSource(newData);
                }
              }}>
              <Image systemName={"plus"} />
            </Button>
          </HStack>
        }>
        {source?.map((i, idx) => (
          <NavigationLink
            destination={
              <ItemView
                navigationTitle={i.title}
                navigationBarTitleDisplayMode={"inline"}
                items={[i]}
              />
            }
            trailingSwipeActions={{
              allowsFullSwipe: false,
              actions: [
                <Button
                  title={"删除"}
                  role="destructive"
                  systemImage={"trash"}
                  action={() => {
                    const newData = source.filter((_, i) => i !== idx);
                    setConfig(newData);
                    setSource(newData);
                  }}
                />,
                // <Button
                //   title={"拷贝"}
                //   systemImage={"doc.on.doc"}
                //   action={() => {
                //     Pasteboard.setString(i.suburl);
                //   }}
                // />,
                <Button
                  title={"编辑"}
                  systemImage={"square.and.pencil"}
                  action={async () => {
                    const res = await Navigation.present(<AddView value={i.suburl} />);
                    if (res) {
                      source[idx] = res;
                      // console.log(source);
                      setConfig(source);
                      setSource([...source]);
                    }
                  }}
                />,
              ],
            }}>
            <HStack>
              {i.imageUrl ? (
                <Image
                  imageUrl={i.imageUrl}
                  frame={{ width: iconSize, height: iconSize }}
                  resizable={true}
                  clipShape={"circle"}
                />
              ) : (
                <Image systemName={"dot.radiowaves.up.forward"} font={iconSize} />
              )}

              <Text fontWeight={"medium"} lineLimit={1}>
                {i.title}
              </Text>
            </HStack>
          </NavigationLink>
        ))}
      </Section>
    </List>
  );
}
