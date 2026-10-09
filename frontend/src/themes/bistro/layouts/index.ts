import { loadHindiFonts } from '../fonts';
import '../bistro.css';
import { themeEase } from '@/site/motion';
import type { ThemeModule } from '../../types';
import { motion } from '../motion';
import { Shell } from './Shell';
import { pages } from './pages';

themeEase('bistro', motion.ease);

const bistro: ThemeModule = {
  Shell,
  pages,
  loadHindiFonts,
  fonts: ['400 1em Gloock', '400 1em "Hanken Grotesk Variable"', '400 1em "IBM Plex Mono"'],
  skin: {
    heading: 'font-display',
    primary: 'bg-t-primary font-medium text-t-on-primary transition-colors hover:bg-t-text',
    secondary: 'border border-t-line bg-transparent font-medium hover:bg-t-text hover:text-t-bg',
    card: 'border border-t-line bg-t-bg',
    input: 'border border-t-line bg-white text-t-text',
    chip: 'border border-t-line bg-t-bg',
  },
};
export default bistro;
