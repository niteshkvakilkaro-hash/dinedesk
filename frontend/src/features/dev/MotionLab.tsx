import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MotionConfig } from 'motion/react';
import { RotateCcw } from 'lucide-react';
// Theme layout modules register their eases and load their fonts.
import '@/themes/haveli/layouts';
import '@/themes/bistro/layouts';
import '@/themes/street/layouts';
import { THEME_KEYS, THEMES, themeVars } from '@/themes/registry';
import type { ThemeKey } from '@/themes/types';
import { ReduceMotionToggle } from '@/site/components/bits';
import { useReduceMotion } from '@/stores/motion';
import { DoorsIntro } from '@/themes/haveli/layouts/DoorsIntro';
import { CurtainReveal, Diya, LotusDivider, useWordRise } from '@/themes/haveli/layouts/ornaments';
import { BistroContext, NameIntro, Odometer, useLineReveal, VelocityMarquee } from '@/themes/bistro/layouts/effects';
import { AngledMarquee, DroppingSticker, PopLetters, SquashButton } from '@/themes/street/layouts/effects';
import { FoodArt, ART_KEYS } from '@/site/components/FoodArt';

/**
 * Development-only playground (route /motion-lab, absent from production builds):
 * every theme's motion tokens and each motion primitive with a replay button,
 * plus the same Reduce motion switch visitors get in the site footer.
 */

function Replay({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-outline !min-h-9 !px-3 text-sm">
      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Replay
    </button>
  );
}

function Demo({ title, onReplay, children }: { title: string; onReplay?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
        {onReplay && <Replay onClick={onReplay} />}
      </div>
      {children}
    </div>
  );
}

function Tokens({ k }: { k: ThemeKey }) {
  const m = THEMES[k].motion;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
        <dt>ease</dt>
        <dd>cubic-bezier({m.ease.join(', ')})</dd>
        <dt>duration</dt>
        <dd>
          fast {m.duration.fast}s · base {m.duration.base}s · slow {m.duration.slow}s · intro {m.duration.intro}s
        </dd>
        <dt>stagger</dt>
        <dd>{m.stagger}s</dd>
        {m.spring && (
          <>
            <dt>spring</dt>
            <dd>
              stiffness {m.spring.stiffness}, damping {m.spring.damping}
            </dd>
          </>
        )}
      </dl>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {m.personality.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function HaveliLab() {
  const [doors, setDoors] = useState(false);
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useWordRise(ref, [n]);
  return (
    <div ref={ref} className="grid gap-4 md:grid-cols-2">
      <Demo title="Carved doors intro (full screen)" onReplay={() => setDoors(true)}>
        <p className="text-sm">Opens over the whole viewport; once per session on the real site. Has a Skip button.</p>
        <div data-hero-media className="mt-3 h-24 rounded bg-[var(--t-x-goldSoft)]" />
        {doors && <DoorsIntro onDone={() => setDoors(false)} heroSelector="[data-hero-media]" />}
      </Demo>
      <Demo title="Word rise + lotus divider" onReplay={() => setN(n + 1)}>
        <h2 key={n} data-rise className="font-display text-4xl text-t-primary">
          Welcome to the haveli
        </h2>
        <LotusDivider key={`d${n}`} className="mt-3" />
      </Demo>
      <Demo title="Diya flicker (pauses off screen)">
        <Diya className="h-28 w-28" />
      </Demo>
      <Demo title="Cream curtain reveal" onReplay={() => setN(n + 1)}>
        <CurtainReveal key={n} className="aspect-video w-full rounded">
          <div className="flex h-full w-full items-center justify-center bg-[var(--t-x-goldSoft)]">
            <FoodArt art="thali" className="h-20 w-20" />
          </div>
        </CurtainReveal>
      </Demo>
    </div>
  );
}

function BistroLab() {
  const [intro, setIntro] = useState(false);
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useMemo(() => ({ velocity: 0 }), []);
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const loop = () => {
      scroll.velocity = (window.scrollY - last) * 0.6;
      last = window.scrollY;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scroll]);
  useLineReveal(ref, [n]);
  return (
    <BistroContext.Provider value={{ introPlaying: false, scroll }}>
      <div ref={ref} className="grid gap-4 md:grid-cols-2">
        <Demo title="Giant name → navbar logo" onReplay={() => setIntro(true)}>
          <div className="flex h-12 items-center border-b border-t-line">
            <span data-nav-logo className="font-display text-2xl" style={{ opacity: intro ? 0 : 1 }}>
              Bistro Lab
            </span>
          </div>
          {intro && <NameIntro name="Bistro Lab" onDone={() => setIntro(false)} />}
        </Demo>
        <Demo title="Line mask reveal + clip-path wipe" onReplay={() => setN(n + 1)}>
          <p key={n} data-lines className="font-display text-3xl leading-tight">
            Seasonal plates, slow coffee, and a long table by the window.
          </p>
          <div key={`w${n}`} data-wipe className="mt-3 h-20 bg-t-primary" />
        </Demo>
        <Demo title="Odometer" onReplay={() => setN(n + 1)}>
          <p className="font-display text-6xl">
            <Odometer key={n} value={128} />
          </p>
        </Demo>
        <Demo title="Specials marquee (scroll the page to change its speed)">
          <VelocityMarquee items={['Cold brew', 'Masala omelette', 'Banana bread']} label="Specials" />
        </Demo>
      </div>
    </BistroContext.Provider>
  );
}

function StreetLab() {
  const [n, setN] = useState(0);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Demo title="Letters pop (spring 400/15, stagger 0.03)" onReplay={() => setN(n + 1)}>
        <h2 key={n} className="font-display text-5xl uppercase">
          <PopLetters text="Vada Pav!" />
        </h2>
      </Demo>
      <Demo title="Sticker drop" onReplay={() => setN(n + 1)}>
        <div key={n} className="relative h-40 overflow-hidden">
          <DroppingSticker art="pav" className="left-4 top-6" rotate={-8} />
          <DroppingSticker art="chaat" className="left-36 top-10" rotate={10} delay={0.12} color="#FFF9EC" />
          <DroppingSticker art="drink" className="right-4 top-4" rotate={6} delay={0.24} />
        </div>
      </Demo>
      <Demo title="Button squash">
        <SquashButton className="street-box min-h-12 bg-t-primary px-6 font-bold uppercase text-t-on-primary">Press me</SquashButton>
      </Demo>
      <Demo title="Angled marquee (pauses off screen)">
        <AngledMarquee words={['Chaat', 'Rolls', 'Pav & fries', 'Coolers']} tone="chilli" />
      </Demo>
    </div>
  );
}

const LABS: Record<ThemeKey, () => React.ReactElement> = { haveli: HaveliLab, bistro: BistroLab, street: StreetLab };

export default function MotionLab() {
  const reduce = useReduceMotion();
  const [theme, setTheme] = useState<ThemeKey>('haveli');
  const def = THEMES[theme];
  const Lab = LABS[theme];
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      <div style={themeVars(def) as CSSProperties} className={`site-root theme-${theme} min-h-screen bg-t-bg pb-40 font-body text-t-text`} data-reduce-motion={reduce || undefined}>
        <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-black/10 bg-white/90 px-4 py-3 font-sans text-ink backdrop-blur">
          <h1 className="font-sans text-lg font-extrabold">Motion lab</h1>
          <span className="rounded bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">dev only</span>
          <div className="flex gap-1" role="group" aria-label="Theme">
            {THEME_KEYS.map((k) => (
              <button key={k} type="button" aria-pressed={theme === k} onClick={() => setTheme(k)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${theme === k ? 'bg-ink text-paper' : 'border border-line'}`}>
                {THEMES[k].name}
              </button>
            ))}
          </div>
          <ReduceMotionToggle className="ml-auto inline-flex min-h-10 items-center text-sm font-semibold" />
        </header>
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
          <section className="rounded-xl border border-black/10 bg-white/60 p-4">
            <h2 className="mb-3 font-sans text-sm font-bold uppercase tracking-wide">{def.name} — motion tokens</h2>
            <Tokens k={theme} />
            {reduce && <p className="mt-3 font-sans text-sm font-semibold">Reduce motion is on: intros, parallax, pinned scroll, flying elements, cursor effects and marquees are off.</p>}
          </section>
          <Lab key={theme} />
          <section className="rounded-xl border border-black/10 bg-white/60 p-4">
            <h2 className="mb-3 font-sans text-sm font-bold uppercase tracking-wide">Shared food illustrations</h2>
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-7" style={{ ['--art-ink' as string]: def.tokens.colors.text, ['--art-a' as string]: '#F2D58E', ['--art-b' as string]: def.tokens.colors.primary }}>
              {ART_KEYS.map((k) => (
                <li key={k} className="text-center font-mono text-xs">
                  <FoodArt art={k} className="mx-auto h-14 w-14" />
                  {k}
                </li>
              ))}
            </ul>
          </section>
          <div className="h-[60vh]" aria-hidden="true" />
        </main>
      </div>
    </MotionConfig>
  );
}
