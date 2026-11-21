/**
 * Add-to-cart feedback on business websites: a small round picture of the dish flies from the
 * button to the cart icon on screen ([data-cart-target]: header bag, phone tab bar, hotel bar),
 * then the cart bumps. Only the bump with reduced motion (OS setting or the site's own switch).
 */
function reducedMotion(): boolean {
  return !!document.querySelector('[data-reduce-motion]') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function cartTarget(): HTMLElement | null {
  const visible = [...document.querySelectorAll<HTMLElement>('[data-cart-target]')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden';
  });
  return visible[0] ?? null;
}

function bump(target: HTMLElement) {
  target.classList.remove('s-cart-bump');
  void target.offsetWidth; // restart the animation when items are added quickly
  target.classList.add('s-cart-bump');
  window.setTimeout(() => target.classList.remove('s-cart-bump'), 600);
}

export function flyToCart(from: { x: number; y: number }, image?: string | null) {
  if (typeof window === 'undefined') return;
  const target = cartTarget();
  if (!target) return;
  if (reducedMotion() || (from.x === 0 && from.y === 0)) {
    bump(target);
    return;
  }
  const to = target.getBoundingClientRect();
  const end = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const size = 44;
  const dot = document.createElement('span');
  dot.className = 's-fly';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = `left:${from.x - size / 2}px;top:${from.y - size / 2}px;width:${size}px;height:${size}px;${image ? `background-image:url("${image.replace(/"/g, '%22')}")` : ''}`;
  document.body.appendChild(dot);

  const dx = end.x - from.x;
  const dy = end.y - from.y;
  // An arc: up first, then down into the cart.
  const lift = Math.min(160, Math.max(60, Math.abs(dx) * 0.25));
  const anim = dot.animate(
    [
      { transform: 'translate(0, 0) scale(0.6)', opacity: 0.4 },
      { transform: `translate(${dx * 0.15}px, ${-lift * 0.6}px) scale(1.15)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.35 - lift}px) scale(0.85)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.6 },
    ],
    { duration: 720, easing: 'cubic-bezier(0.5, 0, 0.25, 1)' },
  );
  const done = () => {
    dot.remove();
    bump(target);
  };
  anim.onfinish = done;
  anim.oncancel = done;
}
