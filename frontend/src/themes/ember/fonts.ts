// Latin subsets load with the theme; Devanagari (Mukta) only for Hindi readers (see haveli/fonts.ts).
import '@fontsource/unbounded/latin-600.css';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';

export const fontFaces = ['600 1em Unbounded', '400 1em "Geist Variable"', '400 1em "Geist Mono Variable"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
