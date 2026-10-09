import { loadHindiFonts } from '../fonts';
import '../bistro.css';
import { themeEase } from '@/site/motion';
import type { ThemeModule } from '../../types';
import { motion } from '../motion';
import { Shell } from './Shell';
import { pages } from './pages';

themeEase('bistro', motion.ease);

const bistro: ThemeModule = { Shell, pages, loadHindiFonts, fonts: ['400 1em Gloock', '400 1em "Hanken Grotesk Variable"', '400 1em "IBM Plex Mono"'] };
export default bistro;
