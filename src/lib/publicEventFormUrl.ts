export type PublicFormRouterMode = "hash" | "browser";

type PublicEventFormUrlOptions = {
  origin?: string;
  routerMode?: string;
};

export function resolvePublicFormRouterMode(mode = import.meta.env.VITE_ROUTER_MODE): PublicFormRouterMode {
  return mode === "browser" ? "browser" : "hash";
}

export function createPublicEventFormUrl(
  token: string | null | undefined,
  options: PublicEventFormUrlOptions = {},
): string | null {
  const normalizedToken = token?.trim();
  if (!normalizedToken) return null;

  const origin = (options.origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");
  if (!origin) return null;

  try {
    const path = `/forms/${encodeURIComponent(normalizedToken)}`;
    return resolvePublicFormRouterMode(options.routerMode) === "browser"
      ? `${origin}${path}`
      : `${origin}/#${path}`;
  } catch {
    return null;
  }
}
