import type { ComponentType } from 'react';
import type { SiteData } from '@/site/types';

export type ThemeKey = 'haveli' | 'bistro' | 'street';
export type PageKey = 'home' | 'menu' | 'about' | 'gallery' | 'contact';

export interface ThemeTokens {
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string; // body-size text on bg, always ≥ 4.5:1
    primary: string; // buttons; white text on it
    onPrimary: string;
    accent: string;
    onAccent: string;
    line: string;
    /** Theme-specific extras (written as --t-x-<name>). */
    extra?: Record<string, string>;
  };
  fonts: { display: string; body: string; mono?: string };
  /** How the accent is used, which decides its contrast check (see lib/contrast.ts). */
  accentRole: 'fill' | 'ink';
  radius: string;
}

/** Per-theme motion tokens. Only transform / opacity / clip-path / filter are ever animated. */
export interface ThemeMotion {
  /** CSS cubic-bezier, for CSS transitions and Motion. */
  ease: [number, number, number, number];
  duration: { fast: number; base: number; slow: number; intro: number };
  stagger: number;
  spring?: { stiffness: number; damping: number };
  /** Short description shown in /motion-lab and the theme picker. */
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

/** What a theme's lazily loaded layout module exports. */
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
  heading: string; // page and dialog titles
  primary: string; // main buttons (theme primary, white text)
  secondary: string; // outline buttons
  card: string; // panels
  input: string; // text fields
  chip: string; // small toggles (order type, options); add aria-pressed / checked styles via [aria-pressed=true]
  /** Optional celebration when something is added (Street: chilli confetti + cart bounce). */
  onAdd?: (origin: { x: number; y: number }) => void;
}

export interface ThemeDefinition {
  key: ThemeKey;
  name: string;
  tokens: ThemeTokens;
  motion: ThemeMotion;
  preview: string; // image URL
  load: () => Promise<ThemeModule>;
}
