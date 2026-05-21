(function () {
  const navWraps = document.querySelectorAll('.nav-wrap');
  const mediaQuery = window.matchMedia('(max-width: 900px)');

  navWraps.forEach((navWrap, index) => {
    const navLinks = navWrap.querySelector('.nav-links');

    if (!navLinks || navWrap.querySelector('.mobile-nav-toggle')) {
      return;
    }

    const navButton = navWrap.querySelector('.nav-btn');
    const menuId = `mobile-nav-${index + 1}`;
    const toggle = document.createElement('button');
    const menu = document.createElement('div');

    toggle.type = 'button';
    toggle.className = 'mobile-nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', menuId);
    toggle.innerHTML = [
      '<span class="mobile-nav-lines" aria-hidden="true">',
      '<span></span><span></span><span></span>',
      '</span>',
      '<span class="mobile-nav-toggle-label">Menu</span>'
    ].join('');

    menu.id = menuId;
    menu.className = 'mobile-nav';
    menu.hidden = true;

    navLinks.querySelectorAll('a').forEach((link) => {
      menu.appendChild(link.cloneNode(true));
    });

    if (navButton) {
      const cta = navButton.cloneNode(true);
      cta.classList.add('mobile-nav-cta');
      menu.appendChild(cta);
    }

    navWrap.appendChild(toggle);
    navWrap.appendChild(menu);

    function closeMenu() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
    }

    toggle.addEventListener('click', toggleMenu);

    menu.addEventListener('click', (event) => {
      const clickedElement = event.target instanceof Element ? event.target : null;

      if (clickedElement && clickedElement.closest('a')) {
        closeMenu();
      }
    });

    document.addEventListener('click', (event) => {
      const clickedElement = event.target instanceof Node ? event.target : null;

      if (!menu.hidden && clickedElement && !navWrap.contains(clickedElement)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    function handleViewportChange(event) {
      if (!event.matches) {
        closeMenu();
      }
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleViewportChange);
    } else {
      mediaQuery.addListener(handleViewportChange);
    }
  });
}());
