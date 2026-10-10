import { useRef, type ComponentType } from 'react';
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
import './site.css';

/** Header, page, footer and the mobile action bar; reveals content as it scrolls in. */
function Shell({ site, children }: ShellProps) {
  const root = useRef<HTMLDivElement>(null);
  const table = useActiveTable(site);
  const room = useActiveRoom(site);
  useRevealAll(root);
  return (
    <div ref={root} className={`s-has-bar flex min-h-screen flex-col ${table || room ? 's-table-mode' : ''}`}>
      <BannerBar site={site} />
      <Header site={site} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer site={site} />
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
