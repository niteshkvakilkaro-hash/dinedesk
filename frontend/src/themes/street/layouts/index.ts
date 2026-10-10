import { createThemeModule } from '@/site/ui';
import { fontFaces, loadHindiFonts } from '../fonts';
import { ComboBuilder } from './Combo';
import { chilliConfetti } from './confetti';

// Street Pop keeps its playful extras: the combo builder on the home page and chilli confetti on add.
export default createThemeModule({ fonts: fontFaces, loadHindiFonts, homeExtra: ComboBuilder, onAdd: chilliConfetti });
