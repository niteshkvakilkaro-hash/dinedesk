import { forwardRef, useRef } from 'react';
import { Link, type LinkProps } from 'react-router';
import { motion, useScroll, useSpring, useTransform, useVelocity, type HTMLMotionProps } from 'motion/react';
import { useLoopActive } from '@/site/hooks';
import { useReduceMotion } from '@/stores/motion';
import { FoodArt, type ArtKey } from '@/site/components/FoodArt';
import { SPRING } from '../motion';

/** Headline letters pop in with overshoot (spring 400/15, 0.03s stagger). Screen readers get the plain text. */
export function PopLetters({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(' ');
  let n = 0;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, wi) => (
          <span key={wi} className="inline-block whitespace-nowrap">
            {Array.from(word).map((ch, ci) => {
              const i = n++;
              return (
                <motion.span
                  key={ci}
                  className="inline-block"
                  initial={{ scale: 0, rotate: i % 2 ? 12 : -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ ...SPRING, delay: delay + i * 0.03, opacity: { duration: 0.1, delay: delay + i * 0.03 } }}
                >
                  {ch}
                </motion.span>
              );
            })}
            {wi < words.length - 1 && ' '}
          </span>
        ))}
      </span>
    </span>
  );
}

/** A food sticker that drops in from above and lands on a spring. Purely decorative. */
export function DroppingSticker({ art, className = '', delay = 0, rotate = -8, color = '#7ED9B5' }: { art: ArtKey; className?: string; delay?: number; rotate?: number; color?: string }) {
  return (
    <motion.div
      className={`pointer-events-none absolute ${className}`}
      initial={{ y: -420, rotate: rotate * 4, opacity: 0 }}
      animate={{ y: 0, rotate, opacity: 1 }}
      transition={{ ...SPRING, delay, opacity: { duration: 0.15, delay } }}
      aria-hidden="true"
    >
      <span className="block rounded-full border-[2.5px] border-[#141414] p-3 shadow-[4px_4px_0_#141414]" style={{ background: color, ['--art-ink' as string]: '#141414', ['--art-a' as string]: '#FFCB2E', ['--art-b' as string]: '#D7261E' }}>
        <FoodArt art={art} className="h-14 w-14 sm:h-20 sm:w-20" />
      </span>
    </motion.div>
  );
}

const squash = { whileTap: { scaleX: 1.12, scaleY: 0.88 }, whileHover: { y: -2 }, transition: SPRING };

export const SquashLink = motion.create(
  forwardRef<HTMLAnchorElement, LinkProps>(function SquashLinkBase(props, ref) {
    return <Link ref={ref} {...props} />;
  }),
);

export function SquashA(props: HTMLMotionProps<'a'>) {
  return <motion.a {...squash} {...props} />;
}

export function SquashButton(props: HTMLMotionProps<'button'>) {
  return <motion.button type="button" {...squash} {...props} />;
}

export const squashProps = squash;

/** Content skews with scroll speed (springy, clamped to ±4°). Off with reduced motion. */
export function ScrollSkew({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduce = useReduceMotion();
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { stiffness: 400, damping: 50 });
  const skewY = useTransform(smooth, [-2500, 0, 2500], [4, 0, -4], { clamp: true });
  return (
    <motion.div className={className} style={reduce ? undefined : { skewY }}>
      {children}
    </motion.div>
  );
}

/** Tilted band of repeating words, scrolling sideways (CSS loop, paused off screen). */
export function AngledMarquee({ words, tone = 'chilli', reverse = false, angle = -2.5 }: { words: string[]; tone?: 'chilli' | 'mustard' | 'ink' | 'mint'; reverse?: boolean; angle?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useLoopActive(ref);
  const reduce = useReduceMotion();
  const tones = {
    chilli: 'bg-[#D7261E] text-white',
    mustard: 'bg-[#FFCB2E] text-[#141414]',
    ink: 'bg-[#141414] text-[#FFCB2E]',
    mint: 'bg-[#7ED9B5] text-[#141414]',
  };
  if (!words.length) return null;
  const content = (hidden: boolean) => (
    <span className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {words.map((w, i) => (
        <span key={i} className="flex items-center whitespace-nowrap px-4 font-display text-2xl uppercase leading-none sm:text-3xl">
          {w}
          <span className="ml-8" aria-hidden="true">
            ✺
          </span>
        </span>
      ))}
    </span>
  );
  return (
    <div ref={ref} className="relative z-10 -mx-4 overflow-hidden py-6" aria-hidden="true">
      <div className={`flex h-16 items-center overflow-hidden border-y-[2.5px] border-[#141414] ${tones[tone]}`} style={{ transform: `rotate(${angle}deg) scale(1.04)` }}>
        {reduce ? (
          <div className="flex justify-center overflow-hidden">{content(false)}</div>
        ) : (
          <div className={`street-marquee-track flex w-max ${reverse ? 'reverse' : ''}`} data-paused={!active}>
            {content(false)}
            {content(true)}
            {content(true)}
            {content(true)}
          </div>
        )}
      </div>
    </div>
  );
}
