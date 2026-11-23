import html2md from "../module/html-to-md";

export function htmlToMd(data: string) {
  return html2md(
    data,
    {
      ignoreTags: ["ins", "del"],
    },
    true
  );
}
