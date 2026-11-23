import { Button, List, Section, useObservable } from "scripting";
import { View as UploadView } from "./upload";

export function View() {
  return (
    <List>
      <Section title={"文件"}>
        <FileButton />
      </Section>
      <Section title={"图片"}>
        <PhotoButton />
        <CameraButton />
      </Section>
    </List>
  );
}

function PhotoButton() {
  const isPresented = useObservable(false);
  const imgData = useObservable<UIImage>();
  return (
    <Button
      title="相册"
      systemImage="photo"
      action={async () => {
        const [img] = await Photos.pickPhotos(1);
        if (!img) return;
        imgData.setValue(img);
        isPresented.setValue(true);
      }}
      sheet={{
        isPresented: isPresented,
        content: <UploadView img={imgData.value!} presentationDetents={["medium", "large"]} />,
      }}
    />
  );
}

function CameraButton() {
  const isPresented = useObservable(false);
  const imgData = useObservable<UIImage>();
  return (
    <Button
      title="相机"
      systemImage="camera"
      action={async () => {
        const img = await Photos.takePhoto();
        if (!img) return;
        imgData.setValue(img);
        isPresented.setValue(true);
      }}
      sheet={{
        isPresented: isPresented,
        content: <UploadView img={imgData.value!} presentationDetents={["medium", "large"]} />,
      }}
    />
  );
}

function FileButton() {
  const isPresented = useObservable(false);
  const imgData = useObservable<UIImage>();
  return (
    <Button
      title="文件"
      systemImage="folder"
      action={async () => {
        const [path] = await DocumentPicker.pickFiles({
          types: [
            "public.image",
            "public.image.live-photo",
            "public.image.raw",
            "public.jpeg",
            "public.jpeg-2000",
            "public.png",
            "public.heic",
            "public.heif",
            "public.gif",
            "public.tiff",
            "com.compuserve.gif",
            "public.svg-image",
            "public.bmp",
            "com.microsoft.bmp",
            "com.microsoft.ico",
          ],
        });
        if (!path) return;

        const file = await FileManager.readAsData(path);
        const img = UIImage.fromData(file);
        if (!img) return;

        imgData.setValue(img);
        isPresented.setValue(true);
      }}
      sheet={{
        isPresented: isPresented,
        content: <UploadView img={imgData.value!} presentationDetents={["medium", "large"]} />,
      }}
    />
  );
}
