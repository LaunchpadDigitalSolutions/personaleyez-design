/* Builds workwear.html, sportswear.html and gifts.html from tools/category-page.template.html.
   New category page: add it to PAGES below (and to js/category-page.js PAGES and the
   admin chips in js/category-page-admin.js), run `npm run build:pages`, commit the result. */
import { readFile, writeFile } from 'node:fs/promises';

export const PAGES = {
  workwear: {
    title: 'Workwear', file: 'workwear.html', contact: 'workwear', enq: 'workwear',
    desc: 'Workwear for salons, trades and healthcare, personalised with embroidery or print. Made in Hartlepool.',
    h1: ['Kit that looks', 'the part.'],
    intro: 'Aprons for salons, hi-vis and healthcare kit, stitched or printed with your name or logo. Choose from the range below, or ask us for something specific.',
    tiles: ['Salon aprons', 'Hi-vis', 'Healthcare']
  },
  sportswear: {
    title: 'Sportswear', file: 'sportswear.html', contact: 'sportswear', enq: 'sportswear',
    desc: 'Personalised sportswear for clubs, teams and training, embroidered or printed in Hartlepool.',
    h1: ['Kit for the whole', 'team.'],
    intro: 'Embroidered and printed sportswear for clubs, teams and training. Choose from the range below, or ask us about a full team order.',
    tiles: ['Team kit', 'Training wear', 'Club extras']
  },
  gifts: {
    title: 'Gifts & Accessories', file: 'gifts.html', contact: 'personalised', enq: 'a gift',
    desc: 'Personalised gifts and accessories: hoodies, totes, mugs and blankets, made to order in Hartlepool.',
    h1: ['The things people', 'keep.'],
    intro: 'Names, dates and little designs on hoodies, totes, mugs and blankets. Choose from the range below, or tell us what you have in mind.',
    tiles: ['Hoodies', 'Totes', 'Mugs and blankets']
  }
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function render(template, key, p) {
  const v = { KEY: key, TITLE: p.title, FILE: p.file, DESC: p.desc, H1A: p.h1[0], H1B: p.h1[1], INTRO: p.intro,
    T1: p.tiles[0], T2: p.tiles[1], T3: p.tiles[2], CONTACT: p.contact, ENQ: p.enq };
  return template.replace(/\{\{([A-Z0-9]+)\}\}/g, (m, k) => { if (!(k in v)) throw new Error('unknown placeholder ' + m); return esc(v[k]); });
}

if (process.argv[1] && process.argv[1].endsWith('build-category-pages.mjs')) {
  const tpl = await readFile(new URL('./category-page.template.html', import.meta.url), 'utf8');
  for (const [key, p] of Object.entries(PAGES)) {
    await writeFile(new URL('../' + p.file, import.meta.url), render(tpl, key, p));
    console.log('wrote', p.file);
  }
}
