import { rates } from "../class/rate";
import countryToCurrency from "../module/country-to-currency";

export async function formatPrice(price: string, region: string) {
  if (rates.type === region) return "";
  const n = parseFloat(
    price.replace(/^\w{0,3}\W?\s?(\d+)[.,](\d+)?,?(\d+)?$/, (_, g1, g2, g3) =>
      g3 ? `${g1}${g2}.${g3}` : `${g1}.${g2}`,
    ),
  );

  if (isNaN(n)) return "";
  return `≈ ${getCurrencySymbol(rates.type)}${(n / (await rates.getRate(region))).toFixed(2)}`;
}

function getCurrencySymbol(region: string, locale = "en") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: countryToCurrency[region as keyof typeof countryToCurrency],
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value;
}
