import type { ComponentType } from 'react';
import type { SiteData } from '@/site/types';

export type ThemeKey = 'haveli' | 'ember' | 'bistro' | 'kulhad' | 'qsr' | 'street' | 'rajwada';
export type PageKey = 'home' | 'menu' | 'about' | 'gallery' | 'contact';

/**
 * Design tokens. Components never hard-code colours: everything goes through
 * these (written to CSS variables by themeVars in registry.ts).
 */
export interface ThemeTokens {
  colors: {
    bg: string;
    surface: string; // cards, inputs
    surface2: string; // raised / alternate sections
    text: string; // "ink"
    muted: string; // secondary text, always ≥ 4.5:1 on bg and surface
    primary: string; // the one action colour (main CTA)
    onPrimary: string; // text on primary, ≥ 4.5:1
    link: string; // primary-family colour safe for small text on bg (≥ 4.5:1)
    accent: string; // secondary colour (gold, olive, chai, mustard…) — role decides its contrast check
    onAccent: string;
    line: string; // borders and rules
    overlay: string; // hero gradient colour behind text
    /** Theme-specific extras (written as --t-x-<name>). */
    extra?: Record<string, string>;
  };
  fonts: { display: string; body: string; mono?: string };
  /** How the accent is used, which decides its contrast check (see lib/contrast.ts). */
  accentRole: 'fill' | 'ink';
  radius: { card: string; button: string; input: string };
  heading: { transform: 'none' | 'uppercase'; tracking: string; weight: number; stretch?: string };
}

/** Layout and detail choices that make each theme recognisable, on top of the shared page structure. */
export interface ThemeStyle {
  dark: boolean;
  /** fullbleed = photo behind the headline; royal = fullbleed with an ornament, gold call to action and an icon bar over the photo's edge; split = text beside a (masked) photo; editorial = huge type + square photo. */
  hero: 'fullbleed' | 'royal' | 'split' | 'editorial';
  /** flat = hairline border · soft = gentle shadow · glass = blurred translucent · sticker = thick border + hard shadow · rule = magazine 1px rules */
  card: 'flat' | 'soft' | 'glass' | 'sticker' | 'rule';
  /** arch = jharokha arch · square · rounded */
  imageMask: 'arch' | 'square' | 'rounded';
  /** Street Pop may use playful springs (tilted cards, squash, confetti); every other theme stays subtle. */
  playful: boolean;
}

/** Motion tokens: subtle and premium, transform / opacity only. */
export interface ThemeMotion {
  ease: [number, number, number, number];
  duration: { fast: number; base: number; slow: number };
  stagger: number;
  /** Short description shown in the theme picker and the style guide. */
  personality: string[];
}

export interface PageProps {
  site: SiteData;
}

export interface ShellProps {
  site: SiteData;
  page: PageKey;
  children: React.ReactNode;
}

/** What a theme's lazily loaded module exports. */
export interface ThemeModule {
  Shell: ComponentType<ShellProps>;
  pages: Record<PageKey, ComponentType<PageProps>>;
  /** Devanagari font subsets, loaded only when the visitor switches to Hindi. */
  loadHindiFonts?: () => Promise<unknown>;
  /** Font faces (CSS font shorthand) to have ready before the first paint. */
  fonts?: string[];
  /** Class names that make the shared cart, checkout and tracking UI match the theme. */
  skin: OrderSkin;
}

export interface OrderSkin {
  heading: string;
  primary: string;
  secondary: string;
  card: string;
  input: string;
  chip: string;
  /** Optional celebration when something is added (Street: chilli confetti). */
  onAdd?: (origin: { x: number; y: number }) => void;
}

export interface ThemeDefinition {
  key: ThemeKey;
  name: string;
  tokens: ThemeTokens;
  style: ThemeStyle;
  motion: ThemeMotion;
  preview: string; // image URL
  load: () => Promise<ThemeModule>;
}
