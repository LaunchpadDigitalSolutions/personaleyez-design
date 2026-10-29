/* ============================================================
   phase-icons.js — inline SVG icons for the school phase circles
   (/schools-shop screen 1). One object, no network, no icon
   library. Thin 1.4px stroke in currentColor, so the circle's
   own colours (default / selected) drive the icon. Reusable by
   other school screens: phaseIcon("primary").
   ============================================================ */
const PHASE_ICONS = {
  // jumper
  primary: '<path d="M9 4 4 7l1.5 4.5 2.5-1V20h8v-9.5l2.5 1L20 7l-5-3c-.5 1.2-1.7 2-3 2S9.5 5.2 9 4z"/><path d="M8 17h8"/>',
  // blazer
  secondary: '<path d="M8.5 4 4 7l1 13h14l1-13-4.5-3"/><path d="M8.5 4 12 11l3.5-7"/><path d="M12 11v9"/><path d="M7.5 15h2"/>',
  // heart
  special: '<path d="M12 19.5s-6.5-4-6.5-9a3.8 3.8 0 0 1 6.5-2.5 3.8 3.8 0 0 1 6.5 2.5c0 5-6.5 9-6.5 9z"/>',
  // school bag
  other: '<path d="M7 9.5a5 5 0 0 1 10 0V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M10 5.2a2 2 0 0 1 4 0"/><path d="M9.5 14h5"/>'
};

function phaseIcon(phase){
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PHASE_ICONS[phase] || PHASE_ICONS.other}</svg>`;
}
