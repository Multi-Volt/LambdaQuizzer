/* Picks a random background gradient each time a page opens. Loaded in <head> so the first
   paint already has it. Add or edit palettes here: [top-left, middle, bottom-right]. */
(function () {
  'use strict';
  const PALETTES = [
    ['#221c5c', '#10132a', '#0a2a30'], // indigo → teal
    ['#3a1650', '#140f2a', '#0d2a3d'], // plum → ocean
    ['#0c2f5a', '#0b1328', '#0a3a35'], // deep sea
    ['#4a1a36', '#170f24', '#1c1a4a'], // berry → indigo
    ['#0f3b33', '#0c1a26', '#23205a'], // forest → violet
    ['#16245e', '#0b1022', '#3a1a4f'], // midnight → plum
    ['#3d2a12', '#15121f', '#14304a'], // amber dusk
    ['#1a3a5c', '#0e1426', '#3a1830'], // steel → wine
  ];
  const [a, b, c] = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  document.documentElement.style.setProperty('--bg-grad', `linear-gradient(155deg, ${a} 0%, ${b} 50%, ${c} 100%)`);
})();
