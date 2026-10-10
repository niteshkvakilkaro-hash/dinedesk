/**
 * Street's add-to-cart celebration: a burst of chilli-coloured paper bits from where the
 * button was pressed (Web Animations, transform/opacity only, ~700 ms, then
 * removed). Nothing happens with reduced motion.
 */
export function chilliConfetti(origin: { x: number; y: number }) {
  if (typeof document === 'undefined' || document.querySelector('[data-reduce-motion]') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:95;overflow:hidden';
  document.body.appendChild(layer);
  // Drawn shapes, not emoji: chilli pod (long pill), dot and square.
  const shapes = ['width:6px;height:16px;border-radius:6px', 'width:9px;height:9px;border-radius:50%', 'width:8px;height:8px;border-radius:1px'];
  const colours = ['#D7261E', '#FFCB2E', '#7ED9B5', '#141414'];
  const n = 16;
  let done = 0;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.style.cssText = `position:absolute;left:${origin.x}px;top:${origin.y}px;${shapes[i % shapes.length]};background:${colours[i % colours.length]};will-change:transform,opacity`;
    layer.appendChild(p);
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${(i % 2 ? 1 : -1) * 220}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 60}px)) scale(0.8) rotate(${(i % 2 ? 1 : -1) * 320}deg)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
    ).onfinish = () => {
      if (++done === n) layer.remove();
    };
  }
}
