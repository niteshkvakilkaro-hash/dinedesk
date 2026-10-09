import { loadHindiFonts } from '../fonts';
import '../haveli.css';
import { themeEase } from '@/site/motion';
import type { ThemeModule } from '../../types';
import { motion } from '../motion';
import { Shell } from './Shell';
import { pages } from './pages';

themeEase('haveli', motion.ease);

const haveli: ThemeModule = {
  Shell,
  pages,
  loadHindiFonts,
  fonts: ['400 1em "Rozha One"', '400 1em Mukta', '600 1em Mukta'],
  skin: {
    heading: 'font-display text-t-primary',
    primary: 'rounded-[4px] bg-t-primary font-semibold text-t-on-primary transition-[filter] hover:brightness-110',
    secondary: 'rounded-[4px] border border-t-primary bg-transparent font-semibold text-t-primary hover:bg-t-primary/5',
    card: 'rounded-[6px] border border-t-line bg-t-surface',
    input: 'rounded-[4px] border border-t-line bg-white text-t-text',
    chip: 'rounded-[4px] border border-t-line bg-t-surface',
  },
};
export default haveli;
