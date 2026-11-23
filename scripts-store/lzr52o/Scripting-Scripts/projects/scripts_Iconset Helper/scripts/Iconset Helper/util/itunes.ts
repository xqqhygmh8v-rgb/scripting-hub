import { fetch } from "scripting";

class App {
  private KEY = "app_setting";
  private base = "https://itunes.apple.com";

  countries: string[] = ["CN", "US"];
  enabledCountries: string[] = ["CN", "US"];

  constructor() {
    this.unSave();
  }

  unSave() {
    Object.assign(this, Storage.get(this.KEY));
  }

  save() {
    const { KEY, base, ...data } = this;
    Storage.set(this.KEY, data);
  }

  async search(term: string, country = "cn", limit = 5, entity = "software") {
    return await fetch(
      `${
        this.base
      }/search?term=${term}&country=${country.toLowerCase()}&entity=${entity}&limit=${limit}&explicit=yes`
    ).then((r) => r.json());
  }

  async lookup(appid: string, region: string) {
    return await fetch(`${this.base}/${region}/lookup?id=${appid}`).then((r) => r.json());
  }
}

export const app = new App();
