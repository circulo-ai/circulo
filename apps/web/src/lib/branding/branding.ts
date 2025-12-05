import { getEnv } from "@/lib/env";

const defaultBrand = {
  name: "Circulo",
  logoUrl: getEnv("NEXT_PUBLIC_BRAND_LOGO_URL") ?? null,
  faviconUrl: getEnv("NEXT_PUBLIC_BRAND_FAVICON_URL") ?? null,
  supportEmail: getEnv("NEXT_PUBLIC_SUPPORT_EMAIL") ?? "",
};

export function useBrandConfig() {
  return defaultBrand;
}
