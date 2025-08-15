// glyphs.js
// defines and renders custom symbols used inline with text or in the environment

document.addEventListener("DOMContentLoaded", () => {
  const glyphs = {
    enso: renderEnso,
    feather: renderFeather

  };

  const elements = document.querySelectorAll("glyph[type], .glyph[data-type]");
  elements.forEach(el => {
    const type = el.getAttribute("type") || el.dataset.type;
    const renderer = glyphs[type];
    if (renderer) {
      renderer(el);
    }
  });
});
