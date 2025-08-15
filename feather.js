// feather.js
// renders a hand-traced feather glyph with scroll-compatible styling

function renderFeather(container) {
  if (container.dataset.featherLoaded === "true" ||
      container.dataset.featherLoading === "true") {
    return;
  }

  container.dataset.featherLoading = "true";
  // Add the refined feather animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes featherFall {
      0% {
        transform: translate3d(0, -3em, 0) rotateZ(0deg) rotateY(0deg);
      }

      10% {
        transform: translate3d(0, -2.7em, 0) rotateZ(2deg) rotateY(-1deg);
      }

      25% {
        transform: translate3d(0, -2em, 0) rotateZ(3deg) rotateY(-2deg);
      }

      45% {
        transform: translate3d(0, -1em, 0) rotateZ(-2deg) rotateY(2deg);
      }

      70% {
        transform: translate3d(0, -0.2em, 0) rotateZ(0.8deg) rotateY(-1deg);
      }

      95% {
        transform: translate3d(0, 0.02em, 0) rotateZ(0.1deg);
      }

      100% {
        transform: translate3d(0, 0, 0) rotateZ(0deg) rotateY(0deg);
      }
    }

    .feather {
      width: 100%;
      height: 100%;
      opacity: 0;
      transform: translate3d(0, -3em, 0) rotateZ(0deg) rotateY(0deg);
      will-change: transform, opacity;
      transform-origin: center;
    }

    .feather-animate {
      opacity: 1;
      animation: featherFall 6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
    }

    svg path {
      fill: none;
      stroke: white;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;
  
  // Only add the style once
  if (!document.querySelector('#feather-styles')) {
    style.id = 'feather-styles';
    document.head.appendChild(style);
  }

  fetch('feather.svg')
    .then(response => response.text())
    .then(svgText => {
      container.dataset.featherLoading = "false";
      container.dataset.featherLoaded = "true";
      container.innerHTML = svgText;

      const svg = container.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '1em');
        svg.setAttribute('height', '1em');
        svg.classList.add('feather');
        setTimeout(() => {
          svg.classList.add('feather-animate');
        }, 100);

        // Apply the refined styling
        svg.querySelectorAll('path, line').forEach(el => {
          el.setAttribute('stroke', 'white');
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke-width', '1.5');
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('stroke-linejoin', 'round');
        });
      }
    })
    .catch(error => {
      container.dataset.featherLoading = "false";
      console.error('Failed to load feather.svg:', error);
    });
}
