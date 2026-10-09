import { loadHindiFonts } from '../fonts';
import '../haveli.css';
import { themeEase } from '@/site/motion';
import type { ThemeModule } from '../../types';
import { motion } from '../motion';
import { Shell } from './Shell';
import { pages } from './pages';

themeEase('haveli', motion.ease);

const haveli: ThemeModule = { Shell, pages, loadHindiFonts, fonts: ['400 1em "Rozha One"', '400 1em Mukta', '600 1em Mukta'] };
export default haveli;
