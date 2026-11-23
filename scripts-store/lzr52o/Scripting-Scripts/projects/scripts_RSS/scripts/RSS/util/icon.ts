export async function getIcon(url: string) {
  const wb = new WebViewController();
  return wb
    .loadURL(url)
    .then(() =>
      wb.evaluateJavaScript(
        `return document.querySelector('link[rel="icon"]')?.href || ""`
      )
    )
    .finally(() => wb.dispose());
}
