import { fetch } from "scripting";
import countryToCurrency from "../module/country-to-currency";

class Rate {
  // private KEY = "RATE_TYPE";
  // type: string = (Storage.get(this.KEY) || "CN") as string;
  type: string = "CN";
  private rates: any = undefined;

  async init(type = this.type) {
    const { rates } = await this.fetch(type);
    this.rates = rates;
  }

  async getRate(type: string) {
    return this.rates[countryToCurrency[type as keyof typeof countryToCurrency]];
  }

  private async fetch(type: string) {
    return await fetch(
      `https://api.exchangerate-api.com/v4/latest/${countryToCurrency[type as keyof typeof countryToCurrency]}`,
    ).then((r) => r.json());
  }
}

export const rates = new Rate();
