import { useEffect, useRef, type ComponentType } from 'react';
import { useLocation } from 'react-router';
import type { OrderSkin, ShellProps, ThemeModule } from '@/themes/types';
import { Footer, MobileBar } from './Footer';
import { Header } from './Header';
import { useRevealAll } from './motion';
import { makePages } from './pages';
import { TableBar } from './TablePages';
import { BannerBar, OfferPopup } from './Growth';
import { useActiveTable } from '../table';
import { useActiveRoom } from '../hotel';
import { RoomBar } from './HotelPages';
import { IN_APP } from '../app';
import { AppBar } from './AppBar';
import './site.css';

/**
 * Header, page, footer and the mobile action bar; reveals content as it scrolls in. Inside the
 * NikoBite app, inner pages get the app top bar and the footer gives way to the bottom tabs
 * (contact and legal details stay on the Profile tab).
 */
function Shell({ site, children }: ShellProps) {
  const root = useRef<HTMLDivElement>(null);
  const table = useActiveTable(site);
  const room = useActiveRoom(site);
  const { pathname } = useLocation();
  const home = pathname === '/';
  useRevealAll(root);
  // A new page fades and rises in (the first one doesn't: it is already on screen).
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = main.current;
    if (!el) return;
    el.classList.remove('s-page-in');
    void el.offsetWidth;
    el.classList.add('s-page-in');
  }, [pathname]);
  return (
    <div ref={root} className={`s-has-bar flex min-h-screen flex-col ${table || room ? 's-table-mode' : ''} ${IN_APP ? 's-in-app' : ''}`}>
      {/* Reading progress along the top (CSS scroll timeline; hidden where browsers lack it). */}
      <div className="s-progress" aria-hidden="true" />
      <BannerBar site={site} />
      {IN_APP && !home ? <AppBar site={site} /> : <Header site={site} />}
      <main ref={main} id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      {!IN_APP && <Footer site={site} />}
      {/* At a table (scanned its QR): the table bar replaces Call / WhatsApp / Order. */}
      {room ? <RoomBar site={site} /> : table ? <TableBar site={site} /> : <MobileBar site={site} />}
      <OfferPopup site={site} />
    </div>
  );
}

/** The shared cart / checkout / tracking UI picks up each theme's look through these classes. */
const skin: OrderSkin = {
  heading: 's-h3',
  primary: 's-btn s-btn-primary',
  secondary: 's-btn s-btn-secondary',
  card: 's-card',
  input: 's-input',
  chip: 's-chip',
};

/**
 * Every theme shares the page structure (hero, quick actions, signature dishes, story, menu
 * preview, ambience, booking, visit us) and differs through tokens, data attributes and extras.
 */
export function createThemeModule(options: {
  fonts: string[];
  loadHindiFonts?: () => Promise<unknown>;
  /** Shown after the signature dishes on the home page (Street: combo builder). */
  homeExtra?: ComponentType;
  onAdd?: OrderSkin['onAdd'];
}): ThemeModule {
  return {
    Shell,
    pages: makePages(options.homeExtra),
    fonts: options.fonts,
    loadHindiFonts: options.loadHindiFonts,
    skin: { ...skin, onAdd: options.onAdd },
  };
}
