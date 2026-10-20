// Original inline vector icons; no external fonts, requests, or image dependencies.
const drawings = {
  admin: '<path d="M4 5.5h16v13H4z"/><path d="M4 13h4l2 3h4l2-3h4M8 9h8M8 6V3m8 3V3"/>',
  whimc: '<path d="m12 2.5 8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3zM3.5 7.3 12 12l8.5-4.7M12 12v9.5"/><path d="m9 7 3-1.7L15 7m-9 4v3m12-3v3"/>',
  invite: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4m-2-4h4M1.5 11v4m21-4v4M8 22v-3m8 3v-3M9 15c1.6 1.4 4.4 1.4 6 0"/><circle cx="8.5" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11.5" r=".8" fill="currentColor" stroke="none"/>',
  teaching: '<path d="M12 7C9 4.8 5.5 4.3 2.5 5.2v14c3-.9 6.5-.4 9.5 1.8 3-2.2 6.5-2.7 9.5-1.8v-14C18.5 4.3 15 4.8 12 7Zm0 0v14M6 9l3 .9M6 13l3 .9M15 9.9l3-.9M15 13.9l3-.9"/>',
  flex: '<path d="M12 21v-8C5 14 3 10 3 5c5 0 9 2 9 8 0-7 3-10 9-10 0 6-2 10-9 10M7 21h10M7 9l5 4m5-6-5 6"/>',
  engagement: '<path d="m3 10 14-6v15L3 14zM3 10H1v4h2m3 1 2 6h4l-2-4M21 7l1-1m-1 7h2m-2 5 1 1"/><path d="M6 9v6M17 8c3 0 3 7 0 7"/>',
  leave: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/>'
};
export const CATEGORY_ICON_IDS = Object.freeze(['admin','whimc','invite','teaching','flex','engagement']);
export function categoryIcon(id) {
  return `<svg class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawings[id]||drawings.leave}</svg>`;
}
