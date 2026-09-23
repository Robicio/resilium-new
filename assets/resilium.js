(function () {
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.querySelector(".nav-links, .navlinks");

  const buildNavigationGroups = (navigation) => {
    if (!navigation) return [];

    const directLinks = Array.from(navigation.children).filter((element) =>
      element.matches("a")
    );
    const findLink = (fragment) =>
      directLinks.find((link) => (link.getAttribute("href") || "").includes(fragment));
    const audienceLinks = [
      findLink("firmy-a-organizace.html"),
      findLink("lideri-a-manazeri.html"),
      findLink("jednotlivci.html"),
    ].filter(Boolean);

    // Contextual landing pages keep their purpose-built navigation.
    if (audienceLinks.length !== 3) return [];

    const createGroup = (label, links, beforeElement) => {
      const usableLinks = links.filter(Boolean);
      if (!usableLinks.length || !beforeElement) return null;

      const group = document.createElement("div");
      const trigger = document.createElement("button");
      const panel = document.createElement("div");
      const panelId = `nav-group-${label
        .toLocaleLowerCase("cs")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")}`;

      group.className = "nav-menu-group";
      trigger.type = "button";
      trigger.className = "nav-menu-trigger";
      trigger.setAttribute("aria-controls", panelId);
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = `${label} <span aria-hidden="true">↓</span>`;
      panel.className = "nav-menu-panel";
      panel.id = panelId;

      navigation.insertBefore(group, beforeElement);
      group.append(trigger, panel);
      usableLinks.forEach((link) => panel.appendChild(link));

      if (usableLinks.some((link) => link.matches('[aria-current="page"], .active'))) {
        trigger.classList.add("is-current");
      }

      return group;
    };

    const audienceGroup = createGroup("Pro koho", audienceLinks, audienceLinks[0]);
    const situationsLink = findLink("situace.html");
    let methodLink = directLinks.find((link) =>
      (link.getAttribute("href") || "").includes("#metoda")
    );

    if (!methodLink && situationsLink) {
      methodLink = document.createElement("a");
      methodLink.href = document.body.classList.contains("home-page")
        ? "#metoda"
        : "index.html#metoda";
      methodLink.textContent = "Jak trénink funguje";
    }

    const helpBefore = methodLink?.isConnected ? methodLink : situationsLink;
    const helpGroup = createGroup(
      "Jak pomáháme",
      [methodLink, situationsLink],
      helpBefore
    );
    const experimentLink = findLink("experiment-pod-tlakem.html");
    const articlesLink = findLink("clanky.html");
    const aboutLink = findLink("#o-nas");
    const contactLink = findLink("#kontakt");
    if (experimentLink) experimentLink.textContent = "Stresový test";

    const groups = [audienceGroup, helpGroup].filter(Boolean);
    const primaryAction = directLinks.find((link) => link.matches(".btn"));
    if (primaryAction) {
      [audienceGroup, helpGroup, experimentLink, articlesLink, aboutLink, contactLink]
        .filter(Boolean)
        .forEach((item) => navigation.insertBefore(item, primaryAction));
    }

    return groups;
  };

  const navigationGroups = buildNavigationGroups(menu);
  const closeNavigationGroups = (exceptGroup = null) => {
    navigationGroups.forEach((group) => {
      if (group === exceptGroup) return;
      group.classList.remove("open");
      group.querySelector(".nav-menu-trigger")?.setAttribute("aria-expanded", "false");
    });
  };

  navigationGroups.forEach((group) => {
    const trigger = group.querySelector(".nav-menu-trigger");
    trigger?.addEventListener("click", () => {
      const shouldOpen = trigger.getAttribute("aria-expanded") !== "true";
      closeNavigationGroups(shouldOpen ? group : null);
      group.classList.toggle("open", shouldOpen);
      trigger.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  if (toggle && menu) {
    const closeMenu = () => {
      menu.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      closeNavigationGroups();
    };

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      menu.classList.toggle("open", !isOpen);
      toggle.setAttribute("aria-expanded", String(!isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
        toggle.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) {
        closeMenu();
      }
    });
  }

  const mobileDisclosureQuery = window.matchMedia("(max-width: 720px)");

  document.querySelectorAll("[data-mobile-disclosure]").forEach((collection, collectionIndex) => {
    const limit = Number.parseInt(collection.dataset.mobileLimit || "3", 10);
    const items = Array.from(collection.children);
    if (!Number.isFinite(limit) || items.length <= limit) return;

    const control = document.createElement("button");
    const collectionId = collection.id || `mobile-disclosure-${collectionIndex + 1}`;
    collection.id = collectionId;
    collection.classList.add("mobile-disclosure-ready");
    control.type = "button";
    control.className = "mobile-disclosure-toggle";
    control.setAttribute("aria-controls", collectionId);
    control.setAttribute("aria-expanded", "false");

    const updateDisclosure = (expanded) => {
      collection.classList.toggle("mobile-expanded", expanded);
      control.setAttribute("aria-expanded", String(expanded));
      control.innerHTML = `${expanded
        ? collection.dataset.mobileLess || "Zobrazit méně"
        : collection.dataset.mobileMore || "Zobrazit další"} <span aria-hidden="true">${expanded ? "↑" : "↓"}</span>`;
    };

    control.addEventListener("click", () => {
      updateDisclosure(control.getAttribute("aria-expanded") !== "true");
    });

    collection.insertAdjacentElement("afterend", control);
    updateDisclosure(false);

    const resetDesktopState = (event) => {
      if (!event.matches) updateDisclosure(false);
    };
    if (mobileDisclosureQuery.addEventListener) {
      mobileDisclosureQuery.addEventListener("change", resetDesktopState);
    }
  });

  document.querySelectorAll("[data-mobile-panel]").forEach((panel, panelIndex) => {
    const control = document.createElement("button");
    const panelId = panel.id || `mobile-panel-${panelIndex + 1}`;
    panel.id = panelId;
    panel.classList.add("mobile-panel-ready");
    control.type = "button";
    control.className = "mobile-panel-toggle";
    control.setAttribute("aria-controls", panelId);
    control.setAttribute("aria-expanded", "false");

    const updatePanel = (expanded) => {
      panel.classList.toggle("mobile-expanded", expanded);
      control.setAttribute("aria-expanded", String(expanded));
      control.innerHTML = `${expanded
        ? panel.dataset.mobilePanelLess || "Skrýt podrobnosti"
        : panel.dataset.mobilePanelLabel || "Zobrazit podrobnosti"} <span aria-hidden="true">${expanded ? "↑" : "↓"}</span>`;
    };

    control.addEventListener("click", () => {
      updatePanel(control.getAttribute("aria-expanded") !== "true");
    });

    panel.insertAdjacentElement("beforebegin", control);
    updatePanel(false);

    const resetDesktopState = (event) => {
      if (!event.matches) updatePanel(false);
    };
    if (mobileDisclosureQuery.addEventListener) {
      mobileDisclosureQuery.addEventListener("change", resetDesktopState);
    }
  });

  document.querySelectorAll("form[data-mailto-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.reportValidity()) return;

      const rows = [];
      form.querySelectorAll("input, select, textarea").forEach((field) => {
        if (!field.value || field.type === "submit" || field.type === "button") return;

        const label = field.id
          ? form.querySelector(`label[for="${field.id}"]`)
          : null;
        rows.push(`${label ? label.textContent.trim() : field.name || "Údaj"}: ${field.value}`);
      });

      const subject = form.dataset.subject || "Poptávka z webu Resilium";
      const href = `mailto:info@allprosys.cz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(rows.join("\n\n"))}`;
      window.location.href = href;
    });
  });

  const stickyCta = document.querySelector(".mobile-cta");
  const hero = document.querySelector("header");

  if (stickyCta && hero) {
    const stickyTargetHash = new URL(stickyCta.href, window.location.href).hash;
    const stickyTarget = stickyTargetHash
      ? document.querySelector(stickyTargetHash)
      : null;
    const stickySuppressionZones = Array.from(
      document.querySelectorAll("[data-sticky-suppress]")
    );

    const updateStickyCta = () => {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const targetRect = stickyTarget?.getBoundingClientRect();
      const targetIsVisible = Boolean(
        targetRect &&
        targetRect.top < window.innerHeight &&
        targetRect.bottom > 0
      );
      const isAtStickyTarget = Boolean(
        stickyTargetHash && window.location.hash === stickyTargetHash
      );
      const suppressionZoneIsVisible = stickySuppressionZones.some((zone) => {
        const zoneRect = zone.getBoundingClientRect();
        return zoneRect.top < window.innerHeight && zoneRect.bottom > 0;
      });
      stickyCta.classList.toggle(
        "visible",
        heroBottom < 80 &&
          !targetIsVisible &&
          !isAtStickyTarget &&
          !suppressionZoneIsVisible
      );
    };

    updateStickyCta();
    window.addEventListener("scroll", updateStickyCta, { passive: true });
    window.addEventListener("load", updateStickyCta);
    window.addEventListener("hashchange", updateStickyCta);

    if (stickyTarget && "IntersectionObserver" in window) {
      const targetObserver = new IntersectionObserver(updateStickyCta, {
        threshold: 0
      });
      targetObserver.observe(stickyTarget);
    }

    if (stickySuppressionZones.length && "IntersectionObserver" in window) {
      const suppressionObserver = new IntersectionObserver(updateStickyCta, {
        threshold: 0
      });
      stickySuppressionZones.forEach((zone) => suppressionObserver.observe(zone));
    }
  }

  const campaignParams = new URLSearchParams(window.location.search);
  const preservedCampaignParams = new URLSearchParams();
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
    const value = campaignParams.get(key);
    if (value) preservedCampaignParams.set(key, value.slice(0, 180));
  });

  if (preservedCampaignParams.toString()) {
    document.querySelectorAll("a.preserve-campaign").forEach((link) => {
      const url = new URL(link.href, window.location.href);
      preservedCampaignParams.forEach((value, key) => url.searchParams.set(key, value));
      link.href = url.toString();
    });
  }
})();
