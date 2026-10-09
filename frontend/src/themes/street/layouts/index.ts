import { loadHindiFonts } from '../fonts';
import '../street.css';
import type { ThemeModule } from '../../types';
import { chilliConfetti } from './confetti';
import { Shell } from './Shell';
import { pages } from './pages';

const street: ThemeModule = {
  Shell,
  pages,
  loadHindiFonts,
  fonts: ['400 1em "Archivo Black"', '400 1em "Space Mono"', '700 1em "Space Mono"'],
  skin: {
    heading: 'font-display uppercase',
    primary: 'street-box-sm bg-t-primary font-bold uppercase text-t-on-primary transition-transform active:scale-x-110 active:scale-y-90',
    secondary: 'street-box-sm bg-t-surface font-bold uppercase text-t-text',
    card: 'street-box bg-t-surface',
    input: 'rounded-[10px] border-[2.5px] border-[#141414] bg-white text-t-text',
    chip: 'rounded-[10px] border-[2.5px] border-[#141414] bg-white',
    onAdd: chilliConfetti,
  },
};
export default street;
