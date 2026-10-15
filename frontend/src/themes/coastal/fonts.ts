// Latin subsets load with the theme (Baloo 2's Devanagari face only downloads when Devanagari text
// shows, through its unicode-range); Mukta's Devanagari body face only for Hindi and Marathi readers.
// Tamil, Malayalam, Kannada and Telugu fall back to the phone's own Noto faces.
import '@fontsource-variable/baloo-2/wght.css';
import '@fontsource-variable/geist/wght.css';

export const fontFaces = ['700 1em "Baloo 2 Variable"', '400 1em "Geist Variable"', '600 1em "Geist Variable"'];

export const loadHindiFonts = () => Promise.all([import('@fontsource/mukta/devanagari-400.css'), import('@fontsource/mukta/devanagari-600.css')]);
