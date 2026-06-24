// Compact geometric SVG icons (low-poly flavour) for the DOM UI.
// Resource icons carry their palette colour; the rest use currentColor.
import { RES_META } from "./data.js";

const wrap = (inner, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" xmlns="http://www.w3.org/2000/svg" class="ic">${inner}</svg>`;

const RES_ICONS = {
  limestone: (c, d) => wrap(
    `<polygon points="3,9 12,4 21,9 12,14" fill="${c}"/><polygon points="3,9 12,14 12,20 3,15" fill="${d}"/><polygon points="21,9 12,14 12,20 21,15" fill="${d}" opacity=".82"/>`),
  granite: (c, d) => wrap(
    `<polygon points="5,7 13,5 19,10 17,18 8,19 4,13" fill="${c}"/><polygon points="13,5 19,10 17,18 13,12" fill="${d}"/>`),
  wood: (c, d) => wrap(
    `<rect x="3" y="13" width="18" height="6" rx="3" fill="${d}"/><ellipse cx="6" cy="16" rx="2.4" ry="3" fill="${c}"/><rect x="5" y="6" width="14" height="6" rx="3" fill="${c}"/><ellipse cx="6" cy="9" rx="2.2" ry="3" fill="${d}"/>`),
  copper: (c, d) => wrap(
    `<polygon points="5,15 19,15 16,10 8,10" fill="${c}"/><polygon points="5,15 19,15 19,18 5,18" fill="${d}"/>`),
  food: (c, d) => wrap(
    `<path d="M5 14 Q12 5 19 14 Q12 18 5 14 Z" fill="${c}"/><path d="M5 14 Q12 18 19 14 L18 16 Q12 20 6 16 Z" fill="${d}"/>`),
  water: (c, d) => wrap(
    `<path d="M12 3 C7 10 6 13 6 15 a6 6 0 0 0 12 0 C18 13 17 10 12 3 Z" fill="${c}"/><path d="M12 18 a3 3 0 0 1-3-3 c0-1 .4-2 1-3 -.2 3 2 4 2 6 Z" fill="#fff" opacity=".45"/>`),
};

const MISC = {
  block: `<polygon points="3,9 12,4 21,9 12,14" fill="#ece0c2"/><polygon points="3,9 12,14 12,20 3,15" fill="#a2855a"/><polygon points="21,9 12,14 12,20 21,15" fill="#cdba93"/>`,
  legacy: `<path d="M12 2 a4 4 0 0 1 4 4 c0 2-2 3.2-3 4 l0 2 3 0 0 2 -3 0 0 4 -2 0 0-4 -3 0 0-2 3 0 0-2 c-1-.8-3-2-3-4 a4 4 0 0 1 4-4 Z" fill="currentColor"/>`,
  tap: `<path d="M11 2 a2 2 0 0 1 2 2 v6 l1-1 a2 2 0 0 1 3 2 l0 5 a4 4 0 0 1-4 4 h-3 a4 4 0 0 1-3-1.5 L4 17 a2 2 0 0 1 3-2.6 l2 1.6 V4 a2 2 0 0 1 2-2 Z" fill="currentColor"/>`,
  pyramid: `<polygon points="12,3 22,20 2,20" fill="currentColor"/><polygon points="12,3 12,20 2,20" fill="currentColor" opacity=".6"/>`,
  // crew
  laborer: `<circle cx="12" cy="6" r="2.6" fill="currentColor"/><path d="M8 11 h8 l1 9 h-3 l-1-5 -1 5 h-3 Z" fill="currentColor"/>`,
  cutter: `<rect x="4" y="14" width="11" height="3" rx="1.5" transform="rotate(-32 9 15)" fill="currentColor"/><rect x="13" y="4" width="6" height="4" rx="1" transform="rotate(-32 16 6)" fill="currentColor"/>`,
  engineer: `<path d="M12 8 a4 4 0 1 0 0 8 a4 4 0 0 0 0-8 Z M12 11 a1 1 0 1 1 0 2 a1 1 0 0 1 0-2 Z M11 2 h2 v3 h-2 Z M11 19 h2 v3 h-2 Z M2 11 h3 v2 H2 Z M19 11 h3 v2 h-3 Z M4 4 l2 2 M18 18 l2 2 M20 4 l-2 2 M6 18 l-2 2" stroke="currentColor" stroke-width="2" fill="currentColor"/>`,
  architect: `<polygon points="5,19 12,5 19,19" fill="none" stroke="currentColor" stroke-width="2"/><line x1="8.5" y1="12" x2="15.5" y2="12" stroke="currentColor" stroke-width="2"/>`,
  priest: `<path d="M12 3 a3 3 0 0 1 3 3 a3 3 0 0 1-2 2.8 V11 h2 v2 h-2 v8 h-2 v-8 H9 v-2 h2 V8.8 A3 3 0 0 1 9 6 a3 3 0 0 1 3-3 Z" fill="currentColor"/>`,
  overseer: `<path d="M2 12 Q12 5 22 12 Q12 19 2 12 Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>`,
  // category / ui
  resource: `<path d="M4 20 l9-9 M11 9 l4-4 a3 3 0 0 1 4 4 l-4 4 Z" stroke="currentColor" stroke-width="2" fill="currentColor"/>`,
  transport: `<circle cx="7" cy="17" r="2.4" fill="currentColor"/><circle cx="17" cy="17" r="2.4" fill="currentColor"/><polygon points="4,12 18,12 16,15 6,15" fill="currentColor"/>`,
  city: `<polygon points="12,4 20,10 20,20 4,20 4,10" fill="currentColor"/><rect x="10" y="14" width="4" height="6" fill="#1c1410" opacity=".5"/>`,
  crew: `<circle cx="8" cy="8" r="2.4" fill="currentColor"/><circle cx="16" cy="8" r="2.4" fill="currentColor"/><path d="M3 20 c0-4 2.5-6 5-6 s5 2 5 6 Z M11 20 c0-4 2.5-6 5-6 s5 2 5 6 Z" fill="currentColor"/>`,
  blessing: `<path d="M12 2 l2.5 6 6.5.4 -5 4.2 1.7 6.4 -5.7-3.6 -5.7 3.6 1.7-6.4 -5-4.2 6.5-.4 Z" fill="currentColor"/>`,
  weather: `<circle cx="9" cy="9" r="4" fill="currentColor"/><path d="M14 18 h6 M11 21 h7 M8 15 h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  warn: `<path d="M12 3 L22 20 H2 Z" fill="currentColor"/><rect x="11" y="9" width="2" height="6" fill="#1c1410"/><rect x="11" y="16" width="2" height="2" fill="#1c1410"/>`,
  scroll: `<rect x="5" y="4" width="14" height="16" rx="2" fill="currentColor"/><rect x="7.5" y="7.5" width="9" height="1.6" rx=".8" fill="#1c1410" opacity=".5"/><rect x="7.5" y="11" width="9" height="1.6" rx=".8" fill="#1c1410" opacity=".5"/><rect x="7.5" y="14.5" width="6" height="1.6" rx=".8" fill="#1c1410" opacity=".5"/>`,
  levelup: `<path d="M12 3 L20 11 H15 V21 H9 V11 H4 Z" fill="currentColor"/>`,
};

// Colourful Pharaoh portrait (uses its own colours, not currentColor).
const PHARAOH = `<path d="M12 2 C7 2 4 5.6 4 10 L5 20.5 L9 18.6 L9 12 a3 3 0 0 1 6 0 L15 18.6 L19 20.5 L20 10 C20 5.6 17 2 12 2 Z" fill="#2f5aa6"/><path d="M8.2 4.3 L9.5 3.9 L9.5 17.4 L8.2 17.8 Z" fill="#e8c14e"/><path d="M15.8 4.3 L14.5 3.9 L14.5 17.4 L15.8 17.8 Z" fill="#e8c14e"/><ellipse cx="12" cy="10.2" rx="3.3" ry="4" fill="#cd9a5f"/><rect x="11" y="13.6" width="2" height="4.2" rx="1" fill="#cd9a5f"/><circle cx="12" cy="5.2" r="1" fill="#e8c14e"/><circle cx="12" cy="5.2" r="0.45" fill="#b23"/><circle cx="10.8" cy="9.9" r="0.6" fill="#23170c"/><circle cx="13.2" cy="9.9" r="0.6" fill="#23170c"/>`;

export function icon(id) {
  if (id === "pharaoh") return wrap(PHARAOH);
  if (RES_ICONS[id]) { const m = RES_META[id]; return RES_ICONS[id](m.color, m.dark); }
  if (MISC[id]) return wrap(MISC[id]);
  return wrap(MISC.block);
}
