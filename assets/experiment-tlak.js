(function () {
  const stages = Array.from(document.querySelectorAll("[data-stage]"));
  if (!stages.length) return;

  const taskSets = {
    calm: [
      { rule: "min", values: [42, 17, 68, 31] },
      { rule: "max", values: [26, 73, 44, 59] },
      { rule: "odd", values: [32, 48, 17, 64] },
      { rule: "even", values: [31, 55, 74, 89] },
      { rule: "min", values: [66, 24, 51, 39] },
      { rule: "max", values: [18, 62, 47, 35] },
      { rule: "odd", values: [28, 36, 81, 54] },
      { rule: "even", values: [23, 67, 42, 91] }
    ],
    pressure: [
      { rule: "min", values: [58, 21, 64, 37] },
      { rule: "max", values: [43, 76, 19, 61] },
      { rule: "odd", values: [46, 72, 39, 58] },
      { rule: "even", values: [27, 53, 84, 69] },
      { rule: "min", values: [71, 29, 46, 63] },
      { rule: "max", values: [32, 68, 54, 17] },
      { rule: "odd", values: [24, 56, 73, 88] },
      { rule: "even", values: [41, 65, 22, 79] }
    ]
  };

  const ruleCopy = {
    min: "NEJMENŠÍ ČÍSLO",
    max: "NEJVĚTŠÍ ČÍSLO",
    odd: "JEDINÉ LICHÉ ČÍSLO",
    even: "JEDINÉ SUDÉ ČÍSLO"
  };

  const symptomCopy = {
    breath: "kratší dech nebo jeho zadržení",
    muscles: "napětí v čelisti, ramenou nebo rukou",
    heat: "silnější tep, teplo nebo vlhké dlaně",
    stomach: "stažení v žaludku, hrudi nebo hrdle",
    rush: "potřeba zrychlit nebo kliknout hned",
    focus: "zúženou pozornost nebo ztrátu pravidla",
    freeze: "zaseknutí, prázdno nebo nehybnost",
    none: "žádný výrazný signál"
  };

  const state = {
    stage: "intro",
    round: null,
    taskIndex: 0,
    tasks: { calm: [], pressure: [] },
    responses: { calm: [], pressure: [] },
    prePressure: 2,
    postPressure: 5,
    symptoms: [],
    memoryCode: "",
    memoryCorrect: false,
    locked: false,
    timerFrame: null,
    pressureCountdownTimer: null,
    taskStartedAt: 0,
    taskDuration: 0,
    pausedAt: 0
  };

  const elements = {
    progress: Array.from(document.querySelectorAll("[data-progress-step]")),
    prePressure: document.getElementById("prePressure"),
    prePressureOutput: document.getElementById("prePressureOutput"),
    postPressure: document.getElementById("postPressure"),
    postPressureOutput: document.getElementById("postPressureOutput"),
    playStage: document.querySelector("[data-stage='play']"),
    roundLabel: document.getElementById("roundLabel"),
    taskCount: document.getElementById("taskCount"),
    taskPrompt: document.getElementById("taskPrompt"),
    answers: document.getElementById("answers"),
    timer: document.querySelector(".xp-timer"),
    timerBar: document.getElementById("timerBar"),
    timeLeft: document.getElementById("timeLeft"),
    timeMessage: document.getElementById("timeMessage"),
    bodyNudge: document.getElementById("bodyNudge"),
    feedback: document.getElementById("taskFeedback")
  };

  function emitEvent(name, detail) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...detail });
  }

  function shuffled(values) {
    const copy = values.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function prepareTasks(round) {
    return taskSets[round].map((task) => ({
      ...task,
      values: shuffled(task.values)
    }));
  }

  function correctValue(task) {
    if (task.rule === "min") return Math.min(...task.values);
    if (task.rule === "max") return Math.max(...task.values);
    if (task.rule === "odd") return task.values.find((value) => value % 2 !== 0);
    return task.values.find((value) => value % 2 === 0);
  }

  function progressForStage(stage) {
    if (["intro", "checkin", "brief"].includes(stage)) return 0;
    if (stage === "play" && state.round === "calm") return 1;
    if (stage === "intermission") return 1;
    if (stage === "play" && state.round === "pressure") return 2;
    if (stage === "postcheck") return 2;
    return 3;
  }

  function updateProgress(stage) {
    const active = progressForStage(stage);
    elements.progress.forEach((item, index) => {
      item.classList.toggle("active", index === active);
      item.classList.toggle("complete", index < active);
    });
  }

  function showStage(stage, focusTarget) {
    state.stage = stage;
    stages.forEach((item) => {
      item.hidden = item.dataset.stage !== stage;
    });
    updateProgress(stage);

    const shell = document.querySelector(".xp-shell");
    if (shell) {
      const shellTop = shell.getBoundingClientRect().top;
      if (shellTop < 0 || shellTop > window.innerHeight * 0.45) {
        shell.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    window.setTimeout(() => {
      const target = focusTarget ? document.getElementById(focusTarget) : null;
      if (target) target.focus({ preventScroll: true });
    }, 80);
  }

  function durationForTask(round, index) {
    if (round === "calm") return 6500;
    return [3600, 3300, 3000, 2700, 2400, 2100, 1800, 1500][index];
  }

  function pressureNudge(index) {
    if (state.round !== "pressure") return "";
    if (index === 2) return "Jen si všimněte: dýcháte volně, nebo dech držíte?";
    if (index === 5) return "Co teď dělají čelist a ramena?";
    if (index === 7) return "Klikáte až po přečtení celého pravidla?";
    return "";
  }

  function renderTask() {
    state.locked = false;
    const tasks = state.tasks[state.round];
    const task = tasks[state.taskIndex];
    const isPressure = state.round === "pressure";

    elements.playStage.classList.toggle("is-pressure", isPressure);
    elements.roundLabel.textContent = isPressure ? "Kolo 2 · Tlak" : "Kolo 1 · Klid";
    elements.taskCount.textContent = `Úloha ${state.taskIndex + 1} z ${tasks.length}`;
    elements.taskPrompt.textContent = ruleCopy[task.rule];
    elements.timeMessage.textContent = isPressure
      ? "Čas se zkracuje · kód držte v paměti."
      : "Máte dost času na přečtení pravidla.";
    elements.bodyNudge.textContent = pressureNudge(state.taskIndex);
    elements.feedback.textContent = "";
    elements.answers.innerHTML = "";

    task.values.forEach((value, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "xp-answer";
      button.dataset.key = String(index + 1);
      button.dataset.choice = String(index);
      button.textContent = String(value);
      button.setAttribute("aria-label", `Možnost ${index + 1}: ${value}`);
      button.addEventListener("click", () => answerTask(index));
      elements.answers.appendChild(button);
    });

    state.taskDuration = durationForTask(state.round, state.taskIndex);
    state.taskStartedAt = performance.now();
    elements.taskPrompt.focus({ preventScroll: true });
    cancelAnimationFrame(state.timerFrame);
    state.timerFrame = requestAnimationFrame(updateTimer);
  }

  function updateTimer(now) {
    if (state.stage !== "play" || state.locked) return;
    const elapsed = now - state.taskStartedAt;
    const remaining = Math.max(0, state.taskDuration - elapsed);
    const ratio = remaining / state.taskDuration;
    elements.timerBar.style.transform = `scaleX(${ratio})`;
    elements.timer.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    elements.timeLeft.textContent = `${(remaining / 1000).toFixed(1).replace(".", ",")} s`;

    if (remaining <= 0) {
      finishTask(null, true);
      return;
    }
    state.timerFrame = requestAnimationFrame(updateTimer);
  }

  function answerTask(index) {
    if (state.stage !== "play" || state.locked) return;
    finishTask(index, false);
  }

  function finishTask(index, timedOut) {
    if (state.locked) return;
    state.locked = true;
    cancelAnimationFrame(state.timerFrame);

    const task = state.tasks[state.round][state.taskIndex];
    const elapsed = Math.min(performance.now() - state.taskStartedAt, state.taskDuration);
    const selectedValue = index === null ? null : task.values[index];
    const isCorrect = selectedValue === correctValue(task);

    state.responses[state.round].push({
      correct: isCorrect,
      timedOut,
      elapsed: Math.round(elapsed),
      rule: task.rule
    });

    const buttons = Array.from(elements.answers.querySelectorAll(".xp-answer"));
    buttons.forEach((button) => {
      button.disabled = true;
    });
    if (index !== null && buttons[index]) buttons[index].classList.add("chosen");

    elements.feedback.textContent = timedOut ? "Čas vypršel · pokračujeme" : "Volba zaznamenána";
    elements.timerBar.style.transform = "scaleX(0)";
    elements.timeLeft.textContent = "0,0 s";

    window.setTimeout(() => {
      state.taskIndex += 1;
      if (state.taskIndex >= state.tasks[state.round].length) {
        finishRound();
      } else {
        renderTask();
      }
    }, timedOut ? 420 : 260);
  }

  function startRound(round) {
    state.round = round;
    state.taskIndex = 0;
    state.responses[round] = [];
    state.tasks[round] = prepareTasks(round);
    showStage("play");
    renderTask();
    emitEvent("pressure_experiment_round_started", { round });
  }

  function finishRound() {
    cancelAnimationFrame(state.timerFrame);
    if (state.round === "calm") {
      const memoryCodes = ["73", "26", "48", "91", "35", "62", "84", "57"];
      state.memoryCode = memoryCodes[Math.floor(Math.random() * memoryCodes.length)];
      document.getElementById("memoryCode").textContent = `${state.memoryCode[0]} — ${state.memoryCode[1]}`;
      document.getElementById("calmRecorded").textContent = `První kolo: ${state.responses.calm.length} rozhodnutí zaznamenáno`;
      showStage("intermission", "intermissionTitle");
    } else {
      showStage("postcheck", "postcheckTitle");
    }
    emitEvent("pressure_experiment_round_completed", { round: state.round });
  }

  function metricsFor(round) {
    const responses = state.responses[round];
    const correct = responses.filter((response) => response.correct).length;
    const answered = responses.filter((response) => !response.timedOut);
    const average = answered.length
      ? answered.reduce((sum, response) => sum + response.elapsed, 0) / answered.length
      : 0;
    return {
      count: responses.length,
      correct,
      errors: responses.length - correct,
      accuracy: Math.round((correct / responses.length) * 100),
      average
    };
  }

  function signed(value, suffix) {
    if (value > 0) return `+${value}${suffix}`;
    if (value < 0) return `−${Math.abs(value)}${suffix}`;
    return `0${suffix}`;
  }

  function buildResult() {
    const calm = metricsFor("calm");
    const pressure = metricsFor("pressure");
    const accuracyDelta = pressure.accuracy - calm.accuracy;
    const pressureDelta = state.postPressure - state.prePressure;
    const speedDeltaSeconds = (pressure.average - calm.average) / 1000;

    let lead;
    if (accuracyDelta <= -10) {
      lead = `V tomto krátkém pokusu klesla přesnost z ${calm.accuracy} % na ${pressure.accuracy} %. Pod časovým tlakem jste udělali o ${pressure.errors - calm.errors} ${Math.abs(pressure.errors - calm.errors) === 1 ? "chybu" : "chyb více"}.`;
    } else if (accuracyDelta < 0) {
      lead = `Přesnost se pod tlakem mírně změnila: ${calm.accuracy} % v klidu a ${pressure.accuracy} % ve druhém kole. Důležitější než samotné číslo může být to, čeho jste si všimli během volby.`;
    } else if (!state.memoryCorrect) {
      lead = `Přesnost hlavních úloh neklesla (${calm.accuracy} % → ${pressure.accuracy} %), vedlejší paměťový úkol se však nepodařilo vybavit. Zátěž se tak mohla projevit mimo hlavní skóre.`;
    } else if (accuracyDelta === 0) {
      lead = `Přesnost zůstala v obou kolech stejná: ${calm.accuracy} %. Tento pokus tedy pokles přesnosti neukázal — i to je platný výsledek.`;
    } else {
      lead = `Ve druhém kole jste přesnost udrželi nebo zlepšili: z ${calm.accuracy} % na ${pressure.accuracy} %. Tento krátký pokus u vás pokles výkonu neukázal.`;
    }

    document.getElementById("resultLead").textContent = lead;
    document.getElementById("calmAccuracyLabel").textContent = `${calm.accuracy} %`;
    document.getElementById("pressureAccuracyLabel").textContent = `${pressure.accuracy} %`;
    document.getElementById("calmAccuracyBar").style.width = `${calm.accuracy}%`;
    document.getElementById("pressureAccuracyBar").style.width = `${pressure.accuracy}%`;
    document.getElementById("accuracyChange").textContent = signed(accuracyDelta, " b.");
    document.getElementById("speedChange").textContent = signed(Number(speedDeltaSeconds.toFixed(1)), " s");
    document.getElementById("pressureChange").textContent = signed(pressureDelta, " / 10");
    document.getElementById("memoryResult").textContent = state.memoryCorrect ? "Vybaven" : "Nevybaven";

    const observed = state.symptoms.filter((value) => value !== "none");
    if (observed.length) {
      const labels = observed.map((value) => symptomCopy[value]);
      const finalLabel = labels.length > 1
        ? `${labels.slice(0, -1).join(", ")} a ${labels[labels.length - 1]}`
        : labels[0];
      document.getElementById("signalTitle").textContent = "Zachytili jste změnu";
      document.getElementById("signalSummary").textContent = `Během druhého kola jste zaznamenali ${finalLabel}. Právě některý z těchto jemných signálů může být vaším časným upozorněním, že tlak začíná měnit způsob volby.`;
    } else {
      document.getElementById("signalTitle").textContent = "Bez výrazného signálu";
      document.getElementById("signalSummary").textContent = "Během druhého kola jste nezaznamenali nic výrazného. To neznamená, že se reakce neměnila; pozornost mohla být plně zaměstnaná úkolem. Příště zkuste sledovat jedinou oblast — třeba dech nebo čelist.";
    }

    let interpretation = "Výsledek popisuje jen tento krátký pokus. Neříká, jak odolní jste ani jak budete reagovat v konfliktu, při prezentaci nebo v důležitém rozhodnutí.";
    if (pressureDelta > 0 && accuracyDelta < 0) {
      interpretation = `Vnímaný tlak vzrostl o ${pressureDelta} ${pressureDelta === 1 ? "bod" : pressureDelta < 5 ? "body" : "bodů"} a současně klesla přesnost. Je to užitečná osobní ukázka, nikoli důkaz příčiny nebo obecná diagnóza.`;
    } else if (pressureDelta > 0 && accuracyDelta >= 0) {
      interpretation = `Vnímaný tlak vzrostl o ${pressureDelta} ${pressureDelta === 1 ? "bod" : pressureDelta < 5 ? "body" : "bodů"}, přesnost však neklesla. Tlak a výkon nemají u každého člověka ani v každém okamžiku stejný vztah.`;
    }
    document.getElementById("interpretation").textContent = interpretation;

    showStage("results", "resultsTitle");
    emitEvent("pressure_experiment_completed", {
      calm_accuracy: calm.accuracy,
      pressure_accuracy: pressure.accuracy,
      pressure_change: pressureDelta
    });
  }

  function resetExperiment() {
    cancelAnimationFrame(state.timerFrame);
    state.round = null;
    state.taskIndex = 0;
    state.tasks = { calm: [], pressure: [] };
    state.responses = { calm: [], pressure: [] };
    state.prePressure = 2;
    state.postPressure = 5;
    state.symptoms = [];
    state.memoryCode = "";
    state.memoryCorrect = false;
    state.locked = false;
    clearInterval(state.pressureCountdownTimer);
    state.pressureCountdownTimer = null;
    elements.prePressure.value = "2";
    elements.prePressureOutput.textContent = "2";
    elements.postPressure.value = "5";
    elements.postPressureOutput.textContent = "5";
    document.getElementById("memoryRecall").value = "";
    const pressureButton = document.getElementById("startPressure");
    pressureButton.disabled = false;
    pressureButton.textContent = "Kód mám · spustit zátěž";
    document.querySelectorAll(".xp-symptoms input").forEach((input) => {
      input.checked = false;
    });
    elements.playStage.classList.remove("is-pressure");
    showStage("intro", "introTitle");
  }

  elements.prePressure.addEventListener("input", () => {
    elements.prePressureOutput.textContent = elements.prePressure.value;
  });

  elements.postPressure.addEventListener("input", () => {
    elements.postPressureOutput.textContent = elements.postPressure.value;
  });

  document.getElementById("beginExperiment").addEventListener("click", () => {
    showStage("checkin", "checkinTitle");
    emitEvent("pressure_experiment_started", {});
  });

  document.getElementById("saveCheckin").addEventListener("click", () => {
    state.prePressure = Number(elements.prePressure.value);
    showStage("brief", "briefTitle");
  });

  document.getElementById("startCalm").addEventListener("click", () => startRound("calm"));
  document.getElementById("startPressure").addEventListener("click", () => {
    const button = document.getElementById("startPressure");
    button.disabled = true;
    let countdown = 3;
    button.textContent = `Začínáme za ${countdown}`;
    state.pressureCountdownTimer = window.setInterval(() => {
      countdown -= 1;
      if (countdown > 0) {
        button.textContent = `Začínáme za ${countdown}`;
        return;
      }
      clearInterval(state.pressureCountdownTimer);
      state.pressureCountdownTimer = null;
      startRound("pressure");
      button.disabled = false;
      button.textContent = "Kód mám · spustit zátěž";
    }, 700);
  });
  document.getElementById("leaveBeforePressure").addEventListener("click", resetExperiment);
  document.getElementById("stopExperiment").addEventListener("click", resetExperiment);
  document.getElementById("restartExperiment").addEventListener("click", resetExperiment);

  document.getElementById("showResult").addEventListener("click", () => {
    state.postPressure = Number(elements.postPressure.value);
    state.symptoms = Array.from(document.querySelectorAll(".xp-symptoms input:checked"))
      .map((input) => input.value);
    const recalledCode = document.getElementById("memoryRecall").value.replace(/\D/g, "");
    state.memoryCorrect = recalledCode === state.memoryCode;
    buildResult();
  });

  document.querySelectorAll(".xp-symptoms input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value === "none" && input.checked) {
        document.querySelectorAll(".xp-symptoms input").forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const none = document.querySelector(".xp-symptoms input[value='none']");
        if (none) none.checked = false;
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (state.stage !== "play" || state.locked) return;
    const index = Number(event.key) - 1;
    if (index >= 0 && index <= 3) {
      event.preventDefault();
      answerTask(index);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (state.stage !== "play" || state.locked) return;
    if (document.hidden) {
      state.pausedAt = performance.now();
      cancelAnimationFrame(state.timerFrame);
    } else if (state.pausedAt) {
      state.taskStartedAt += performance.now() - state.pausedAt;
      state.pausedAt = 0;
      state.timerFrame = requestAnimationFrame(updateTimer);
    }
  });
})();
