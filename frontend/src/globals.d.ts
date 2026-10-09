/** Early /site request started by index.html on business websites (consumed once by useSite). */
interface Window {
  __ddSite?: Promise<{ data: unknown } | null>;
}
