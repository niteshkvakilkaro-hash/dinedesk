/** True when the site is rendered inside the dashboard's theme picker iframe (?preview=1).
 * Previews replay intros on every theme switch and are never shown to visitors. */
export const PREVIEW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1' && window.parent !== window;
