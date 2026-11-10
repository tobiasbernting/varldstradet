// Imported before anything else. There is one art style now; forget the style choice older versions saved.
try {
  for (const k of ['varldstradet.art', 'varldstradet.art.prev', 'varldstradet.art.tries']) localStorage.removeItem(k);
} catch {
  /* no storage */
}
