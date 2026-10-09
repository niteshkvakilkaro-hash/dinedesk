import { loadHindiFonts } from '../fonts';
import '../street.css';
import type { ThemeModule } from '../../types';
import { Shell } from './Shell';
import { pages } from './pages';

const street: ThemeModule = { Shell, pages, loadHindiFonts, fonts: ['400 1em "Archivo Black"', '400 1em "Space Mono"', '700 1em "Space Mono"'] };
export default street;
