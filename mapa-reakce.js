(function () {
  const form = document.getElementById("mapForm");
  if (!form) return;

  const intro = document.getElementById("mapIntro");
  const results = document.getElementById("mapResults");
  const startButton = document.getElementById("startMap");
  const backButton = document.getElementById("backStep");
  const nextButton = document.getElementById("nextStep");
  const submitButton = document.getElementById("showResult");
  const contextError = document.getElementById("contextError");
  const stepError = document.getElementById("stepError");
  const steps = Array.from(document.querySelectorAll(".question-step"));
  const progressBar = document.getElementById("progressBar");
  const progress = document.querySelector(".map-progress");
  const progressLabel = document.getElementById("progressLabel");
  const progressPercent = document.getElementById("progressPercent");
  const chart = document.getElementById("resultChart");
  let activeStep = 0;
  let lastScores = null;

  const contexts = {
    kritika: "Kritika nebo konflikt",
    vykon: "Výkon před lidmi",
    rozhodovani: "Rozhodování v časové tísni",
    hranice: "Tlak na hranice",
    jina: "Jiná náročná situace"
  };

  const domains = {
    mind: {
      label: "Dostupnost myšlení",
      focus: "Vytvořit prostor pro další možnost",
      description: "Ve vašich odpovědích se tlak nejvíc dotýká udržení nitě, zachycení detailů nebo schopnosti vidět víc než první řešení.",
      action: "Nahlas si pojmenujte cíl situace a dvě možné cesty. Teprve potom zvolte další krok."
    },
    pace: {
      label: "Volba tempa",
      focus: "Vrátit tempo pod vlastní kontrolu",
      description: "Ve vašich odpovědích tlak nejvíc zrychluje řeč, rozhodnutí nebo potřebu situaci rychle uzavřít.",
      action: "Před prvním krokem dokončete jednu větu: „Nejdřív potřebuji ověřit…“ a skutečně ji ověřte."
    },
    contact: {
      label: "Volba v kontaktu",
      focus: "Obnovit možnost zvolit odpověď",
      description: "Ve vašich odpovědích se tlak nejvíc projevuje v kontaktu — obranou, tvrdším tónem, stažením nebo souhlasem proti vlastnímu záměru.",
      action: "Nejdřív jednou větou shrňte, co jste slyšeli. Potom položte jednu věcnou otázku nebo jasně řekněte svou hranici."
    },
    recovery: {
      label: "Návrat po situaci",
      focus: "Dát situaci jasný konec",
      description: "Ve vašich odpovědích pokračuje největší část zátěže až po události — v myšlenkách, napětí nebo obtížném přepnutí na další úkol.",
      action: "Zapište si tři body: co se stalo, co je rozhodnuto a kdy se k tématu vrátíte. Pak přejděte ke konkrétnímu dalšímu úkolu."
    }
  };

  const emitEvent = (name, detail) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: name, ...detail });
    }
  };

  const selectedContext = () => document.querySelector('input[name="context"]:checked')?.value;

  const setStep = (index) => {
    activeStep = index;
    steps.forEach((step, stepIndex) => {
      step.hidden = stepIndex !== activeStep;
    });

    const percent = Math.round(((activeStep + 1) / steps.length) * 100);
    progressBar.style.width = `${percent}%`;
    progress.setAttribute("aria-valuenow", String(percent));
    progressLabel.textContent = `Oblast ${activeStep + 1} ze ${steps.length}`;
    progressPercent.textContent = `${percent} %`;
    backButton.hidden = activeStep === 0;
    nextButton.hidden = activeStep === steps.length - 1;
    submitButton.hidden = activeStep !== steps.length - 1;
    stepError.textContent = "";
    steps[activeStep].querySelectorAll(".question-card").forEach((card) => card.classList.remove("is-missing"));
    steps[activeStep].querySelector("h3").focus({ preventScroll: true });
    document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validateStep = () => {
    const cards = Array.from(steps[activeStep].querySelectorAll(".question-card"));
    let firstMissing = null;

    cards.forEach((card) => {
      const name = card.dataset.question;
      const isAnswered = Boolean(form.querySelector(`input[name="${name}"]:checked`));
      card.classList.toggle("is-missing", !isAnswered);
      if (!isAnswered && !firstMissing) firstMissing = card;
    });

    if (firstMissing) {
      stepError.textContent = "Odpovězte prosím na všechny tři výroky v této oblasti.";
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }

    stepError.textContent = "";
    return true;
  };

  const scoreDomain = (prefix) => {
    const values = Array.from(form.querySelectorAll(`input[name^="${prefix}_"]:checked`)).map((input) => Number(input.value));
    return Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 4)) * 100);
  };

  const buildResult = () => {
    const scores = {
      mind: scoreDomain("mind"),
      pace: scoreDomain("pace"),
      contact: scoreDomain("contact"),
      recovery: scoreDomain("recovery")
    };
    lastScores = scores;

    const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topScore = ranking[0][1];
    const tiedDomains = ranking.filter(([, score]) => topScore - score <= 8).map(([key]) => key);
    const focusKey = ranking[0][0];
    const contextKey = selectedContext();

    document.getElementById("resultContext").textContent = contexts[contextKey];

    if (tiedDomains.length >= 3) {
      document.getElementById("resultTitle").textContent = "Tlak se ve vašich odpovědích rozkládá napříč reakcí.";
      document.getElementById("resultLead").textContent = "Mezi třemi nebo čtyřmi oblastmi je jen malý rozdíl. Dává proto větší smysl vybrat jeden konkrétní projev, který má pro vás největší dopad, než hledat jedinou hlavní reakci.";
    } else if (tiedDomains.length === 2) {
      document.getElementById("resultTitle").textContent = "Ve vašem profilu vystupují dvě propojená místa.";
      document.getElementById("resultLead").textContent = `Nejsilněji se objevují oblasti „${domains[tiedDomains[0]].label}“ a „${domains[tiedDomains[1]].label}“. Malý rozdíl mezi nimi není vhodné přeceňovat; v reálné situaci se mohou navzájem posilovat.`;
    } else {
      document.getElementById("resultTitle").textContent = `Nejvíc vystupuje oblast „${domains[focusKey].label}“.`;
      document.getElementById("resultLead").textContent = "To není diagnóza ani vaše povaha. Je to místo, kde se ve zvoleném kontextu podle vašich odpovědí nejčastěji zmenšuje možnost jednat tak, jak skutečně chcete.";
    }

    chart.innerHTML = Object.entries(domains).map(([key, domain]) => `
      <div class="result-row${tiedDomains.includes(key) ? " is-focus" : ""}">
        <div class="result-row-head"><strong>${domain.label}</strong><span>${scores[key]} / 100</span></div>
        <div class="result-track" aria-label="${domain.label}: ${scores[key]} ze 100"><span data-width="${scores[key]}"></span></div>
      </div>
    `).join("");

    document.getElementById("focusTitle").textContent = domains[focusKey].focus;
    document.getElementById("focusDescription").textContent = domains[focusKey].description;
    document.getElementById("focusAction").textContent = domains[focusKey].action;

    const summary = Object.entries(domains)
      .map(([key, domain]) => `${domain.label}: ${scores[key]}/100`)
      .join("\n");
    const subject = "Můj profil pod tlakem – chci probrat výsledek";
    const body = `Dobrý den,\n\nvyplnil/a jsem Mapu reakce pod tlakem pro kontext „${contexts[contextKey]}“.\n\nMoje stručné shrnutí:\n${summary}\n\nNejvíc vystupuje: ${domains[focusKey].label}.\n\nRád/a bych probral/a, jak s touto reakcí prakticky pracovat.\n\n`;
    document.getElementById("shareResult").href = `mailto:info@allprosys.cz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    form.hidden = true;
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      chart.querySelectorAll("[data-width]").forEach((bar) => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    }, 80);

    emitEvent("map_completed", {
      context: contextKey,
      primary_domain: focusKey
    });
  };

  startButton.addEventListener("click", () => {
    const context = selectedContext();
    if (!context) {
      contextError.textContent = "Vyberte prosím jednu konkrétní situaci.";
      document.querySelector(".context-options").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    contextError.textContent = "";
    intro.hidden = true;
    form.hidden = false;
    setStep(0);
    emitEvent("map_started", { context });
  });

  document.querySelectorAll('input[name="context"]').forEach((input) => {
    input.addEventListener("change", () => {
      contextError.textContent = "";
    });
  });

  form.addEventListener("change", (event) => {
    const card = event.target.closest(".question-card");
    if (card) card.classList.remove("is-missing");
  });

  nextButton.addEventListener("click", () => {
    if (!validateStep()) return;
    if (activeStep < steps.length - 1) {
      setStep(activeStep + 1);
    }
  });

  backButton.addEventListener("click", () => {
    if (activeStep > 0) {
      setStep(activeStep - 1);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (validateStep()) buildResult();
  });

  document.getElementById("printResult").addEventListener("click", () => {
    emitEvent("map_result_saved", { primary_domain: Object.entries(lastScores).sort((a, b) => b[1] - a[1])[0][0] });
    window.print();
  });

  document.getElementById("shareResult").addEventListener("click", () => {
    emitEvent("map_contact_clicked", { source: "result_email" });
  });

  document.getElementById("trainingCta").addEventListener("click", () => {
    emitEvent("map_conversion_clicked", { destination: "public_training" });
  });

  document.getElementById("restartMap").addEventListener("click", () => {
    form.reset();
    lastScores = null;
    results.hidden = true;
    intro.hidden = false;
    contextError.textContent = "";
    stepError.textContent = "";
    chart.innerHTML = "";
    activeStep = 0;
    document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "start" });
  });

})();
