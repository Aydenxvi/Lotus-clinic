/* Small, self-contained icon set. No external font/CDN required. */
(function () {
  const p = {
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L7 10.4a16 16 0 0 0 6.6 6.6l1.9-2a2 2 0 0 1 1.8-.6l3 .5a2 2 0 0 1 1.7 2Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 18h3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    medal: '<circle cx="12" cy="8" r="5"/><path d="m8.2 12-1.7 9 5.5-2 5.5 2-1.7-9"/><path d="m12 5.7.7 1.4 1.6.2-1.1 1.1.3 1.6L12 9.2l-1.5.8.3-1.6-1.1-1.1 1.6-.2Z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    stethoscope: '<path d="M6 3v5a6 6 0 0 0 12 0V3M4 3h4M16 3h4M12 14v2a4 4 0 0 0 8 0v-2"/><circle cx="20" cy="12" r="2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3.3 12h4l2-3 3 6 2-3h6"/>',
    bone: '<path d="M16 10 8 18a3 3 0 1 1-4-4l-1-1a3 3 0 0 1 4-4l8-8a3 3 0 0 1 4 4l1 1a3 3 0 0 1-4 4Z"/>',
    sparkles: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 18l.7 2.3L22 21l-2.3.7L19 24l-.7-2.3L16 21l2.3-.7L19 18Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3 21l1.9-5.4a8.5 8.5 0 1 1 16.1-4.1Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    microscope: '<path d="m7 18 5-5m-3-7 4 4m-1-8 4 4-5 5-4-4 5-5ZM6 18h13M12 12a6 6 0 0 1 5 6M4 22h17"/>',
    hospital: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M12 8v7M8.5 11.5h7M9 21v-4h6v4"/>',
    ambulance: '<path d="M3 6h12v13H3V6Zm12 5h4l3 4v4h-7v-8ZM7 10h4m-2-2v4"/><circle cx="7.5" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    login: '<path d="M10 17l5-5-5-5M15 12H3M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M8 13 6 22l6-3 6 3-2-9"/>',
  };
  window.lotusIcon = function (name, cls) {
    return `<svg class="lotus-svg ${cls || ''}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name] || p.sparkles}</svg>`;
  };
})();
