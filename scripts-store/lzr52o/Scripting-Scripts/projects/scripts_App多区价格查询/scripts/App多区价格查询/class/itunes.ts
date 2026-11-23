import { fetch } from "scripting";

class ITunes {
  private KEY = "itunes_setting";
  private base = "https://itunes.apple.com";

  countries = [{ region: "CN", enabled: true }];

  constructor() {
    this.readStorage();
  }

  readStorage() {
    Object.assign(this, Storage.get(this.KEY));
  }

  save() {
    const { KEY, base, ...data } = this;
    Storage.set(this.KEY, data);
  }

  async search(term: string, country = "cn", limit = 10, entity = "software") {
    return await fetch(
      `${
        this.base
      }/search?term=${term}&country=${country.toLowerCase()}&entity=${entity}&limit=${limit}&explicit=yes`,
    ).then((r) => r.json());
  }

  async lookup(appid: string, region: string) {
    return await fetch(`${this.base}/${region}/lookup?id=${appid}`).then((r) => r.json());
  }
}

export const itunes = new ITunes();
