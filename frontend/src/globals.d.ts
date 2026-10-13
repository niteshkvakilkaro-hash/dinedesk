/** Early /site request started by index.html on business websites (consumed once by useSite). */
interface Window {
  __ddSite?: Promise<{ data: unknown } | null>;
  /** Data the server-side renderer used for this page (scripts/site-server.mjs). */
  __ddSsr?: { site?: unknown; menu?: unknown; gallery?: unknown; hotel?: unknown };
}
