/** Server-rendered or pre-rendered HTML (#prerender) gives way to the app once it shows the same page. */
export function showApp() {
  if (typeof document === 'undefined') return;
  document.getElementById('prerender')?.remove();
  const root = document.getElementById('root');
  if (root) root.style.display = '';
}
