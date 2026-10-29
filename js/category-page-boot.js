/* category-page-boot.js — wires the Category page feature into a Peach State page.
   The page sets <body data-page="workwear"> and has #cp-grid and #cp-basket.
   Products are read with the public anon key (RLS: active rows only). */
import { mountCategoryPage } from './category-page.js';

document.addEventListener('DOMContentLoaded', () => {
  const key = document.body.dataset.page;
  const grid = document.getElementById('cp-grid'), basket = document.getElementById('cp-basket');
  if (!key || !grid || !basket) return;
  mountCategoryPage({
    pageKey: key, grid, basket, phone: BRAND.phone,
    load: () => sb('ps_products?select=*&active=eq.true&is_school_item=eq.false&page_key=eq.' + encodeURIComponent(key) + '&order=sort_order,name', {}, 'PS-700'),
    onError: m => { console.error(m); if (typeof logError === 'function') logError(String(m).slice(0, 6), m); }
  });
});
