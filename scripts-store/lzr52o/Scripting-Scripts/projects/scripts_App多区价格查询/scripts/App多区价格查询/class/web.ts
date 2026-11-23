import { fetch } from "scripting";
import { parseHTML } from "../module/linkedom";

class Web {
  async price(id: string, region: string) {
    const { document } = parseHTML(
      await fetch(`https://apps.apple.com/${region}/app/id${id}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        },
      }).then((r) => r.text()),
    );

    return {
      inapp: Array.from(document.querySelectorAll(".text-pair.svelte-1gyt6l2"))
        .map((e: any) => {
          const spans = e.querySelectorAll("span");
          if (spans.length !== 2) return null;
          return {
            membership: spans[0]?.textContent.trim(),
            price: spans[1]?.textContent.trim(),
          };
        })
        .filter(Boolean),
    };
  }
}

export const web = new Web();
