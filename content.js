(() => {
  if (window.__instagramCommentDeleterLoaded) return;
  window.__instagramCommentDeleterLoaded = true;

  const DEFAULTS = {
    batchSize: 12,
    delaySeconds: 10,
    running: false
  };

  // Tempo (ms) que o sistema espera apos deletar um lote antes de checar
  // se a lista de comentarios ja recarregou. Nao e exposto ao usuario.
  const RELOAD_WAIT_MS = 6000;

  // Padroes de texto reconhecidos pela automacao, em varios idiomas. O
  // matcher (matchesAny) normaliza antes de comparar, entao "Excluir",
  // "excluir" e "EXCLUIR" dao match, e "Alternar caixa de selecao" e
  // "alternar caixa de seleção" tambem. Adicione mais idiomas aqui.
  const TEXT = {
    select: ["selecionar", "select"],
    selectAll: ["selecionar tudo", "select all"],
    cancel: ["cancelar", "cancel"],
    delete: ["excluir", "delete"],
    deleteWithComment: [
      "excluir comentario", "excluir comentário",
      "excluir comentarios", "excluir comentários",
      "delete comment", "delete comments"
    ],
    toggleCheckbox: [
      "alternar caixa de selecao", "alternar caixa de seleção",
      "toggle checkbox", "toggle selection"
    ]
  };

  function matchesAny(text, patterns) {
    const normalized = normalize(text);
    return patterns.some((p) => normalized === normalize(p));
  }

  const state = {
    running: false,
    timer: null,
    nextActionAt: null,
    options: { ...DEFAULTS }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Highlight temporario para debug: desenha um contorno vermelho no elemento
  // alvo por alguns ms, para que o usuario consiga ver qual botao a extensao
  // esta prestes a clicar.
  function debugHighlight(element, durationMs = 1500) {
    if (!element || !element.style) return;
    const original = element.style.outline;
    const originalOffset = element.style.outlineOffset;
    element.style.outline = "3px solid #ff1744";
    element.style.outlineOffset = "2px";
    setTimeout(() => {
      element.style.outline = original;
      element.style.outlineOffset = originalOffset;
    }, durationMs);
  }

  // Verifica se existe algum dialog/modal aberto e visivel.
  function isModalOpen() {
    const dialogs = document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true']");
    return Array.from(dialogs).some((d) => {
      const style = window.getComputedStyle(d);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = d.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  // Tenta forçar o fechamento de qualquer modal aberto. Necessario porque
  // o dispatchEvent do click no botao "Excluir" do modal as vezes dispara
  // a acao de deletar mas nao fecha o modal, o que deixa o ciclo travado.
  async function forceCloseModal() {
    if (!isModalOpen()) return true;

    console.log("[ICC] forceCloseModal: modal aberto, tentando fechar");

    // Tentativa 1: pressionar Escape no document e em todos os dialogs.
    for (const target of [document, ...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true']")]) {
      for (const type of ["keydown", "keyup"]) {
        target.dispatchEvent(new KeyboardEvent(type, {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        }));
      }
    }
    await sleep(400);
    if (!isModalOpen()) { console.log("[ICC] forceCloseModal: fechado com Escape"); return true; }

    // Tentativa 2: clicar no botao "Cancelar" / "Cancel".
    const cancelarBtn = Array.from(document.querySelectorAll("button, [role='button'], a"))
      .filter(visible)
      .find((el) => matchesAny(el.innerText || el.textContent || el.getAttribute("aria-label") || "", TEXT.cancel));
    if (cancelarBtn) {
      clickAtCenter(cancelarBtn, { cleanClick: true });
      await sleep(400);
      if (!isModalOpen()) { console.log("[ICC] forceCloseModal: fechado com Cancelar"); return true; }
    }

    // Tentativa 3: clicar no botao de fechar (X) via aria-label.
    const closeBtn = document.querySelector(
      "[aria-label='Fechar'], [aria-label='Close'], [aria-label='Fechar diálogo'], [aria-label='Close dialog']"
    );
    if (closeBtn) {
      clickAtCenter(closeBtn, { cleanClick: true });
      await sleep(400);
      if (!isModalOpen()) { console.log("[ICC] forceCloseModal: fechado com X"); return true; }
    }

    // Tentativa 4: clicar fora do modal (no canto superior esquerdo, onde
    // costuma estar o backdrop).
    const dialog = document.querySelector("[role='dialog'], [aria-modal='true']");
    if (dialog) {
      const rect = dialog.getBoundingClientRect();
      const x = Math.max(2, rect.left - 20);
      const y = Math.max(2, rect.top - 20);
      const target = document.elementFromPoint(x, y);
      if (target && target !== document.body && target !== document.documentElement) {
        clickAtCenter(target, { cleanClick: true });
        await sleep(400);
        if (!isModalOpen()) { console.log("[ICC] forceCloseModal: fechado clicando fora"); return true; }
      }
    }

    console.log("[ICC] forceCloseModal: nao foi possivel fechar o modal");
    return false;
  }

  function normalize(text) {
    return (text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function inViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
  }

  function textOf(element) {
    return normalize([
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" "));
  }

  function allVisibleElements() {
    return Array.from(document.querySelectorAll("button,[role='button'],a,span,div,[aria-label]"))
      .filter((element) => visible(element) && inViewport(element));
  }

  function findClickable(matchers) {
    return allVisibleElements()
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      })
      .find((element) => {
        const text = textOf(element);
        return matchers.some((matcher) => matcher(text, element));
      });
  }

  function clickElement(element) {
    const target = element.closest("button,[role='button'],a,[tabindex='0']") || element;
    target.scrollIntoView({ block: "center", inline: "center" });
    clickAtCenter(target);
  }

  function clickAtCenter(element, options) {
    const cleanClick = !!(options && options.cleanClick);

    // Caminho "limpo": usado APENAS para o botao "Excluir" do modal de
    // confirmacao do Instagram. O teste do usuario mostrou que o handler
    // do React nesse <button> IGNORA o sequencia de pointer/mouse, ignora
    // .click(), e so responde a um dispatchEvent(new MouseEvent("click"))
    // "limpo", sem coordenadas. Se fizermos a sequencia completa antes,
    // o React acaba interpretando como double-click e abortando.
    if (cleanClick) {
      console.log("[ICC] clickAtCenter: cleanClick path, element =", element.tagName, element.innerText);
      element.scrollIntoView({ block: "center", inline: "center" });
      const result = element.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      console.log("[ICC] clickAtCenter: dispatchEvent result =", result);
      return;
    }

    // Caminho padrao: usado para todos os outros cliques (checkboxes,
    // "Selecionar", "Excluir" da listagem). E o codigo original que
    // funcionava antes.
    const rect = element.getBoundingClientRect();
    const x = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    const target = document.elementFromPoint(x, y) || element;
    const clickable = target.closest("button,[role='button'],a,[tabindex='0']") || target;

    for (const type of ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventCtor = type.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      clickable.dispatchEvent(new EventCtor(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      }));
    }

    if (typeof clickable.click === "function") clickable.click();
  }

  async function clickText(matchers, timeoutMs = 7000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs && state.running) {
      const element = findClickable(matchers);
      if (element) {
        clickElement(element);
        await sleep(500);
        return element;
      }
      await sleep(250);
    }
    return null;
  }

  function hasVisibleSelectButton() {
    return allVisibleElements().some((element) => {
      const rect = element.getBoundingClientRect();
      return matchesAny(textOf(element), TEXT.select) && rect.width <= 180 && rect.height <= 80;
    });
  }

  async function waitForListReady(timeoutMs) {
    const startedAt = Date.now();
    let sawLoadingState = false;

    while (Date.now() - startedAt < timeoutMs && state.running) {
      const bodyText = textOf(document.body);
      const ready = hasVisibleSelectButton();

      if (ready && (sawLoadingState || Date.now() - startedAt > 1200)) return true;
      if (!ready || bodyText.length < 300) sawLoadingState = true;

      await sleep(350);
    }

    return hasVisibleSelectButton();
  }

  function findCommentCheckboxes(clickedThisCycle) {
    return Array.from(document.querySelectorAll("[role='button'],[aria-label]"))
      .filter((element) => visible(element) && inViewport(element))
      .filter((element) => !clickedThisCycle.has(element))
      .filter((element) => matchesAny(textOf(element), TEXT.toggleCheckbox))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  function findScrollContainer() {
    const candidates = Array.from(document.querySelectorAll("article,main,section,div"))
      .filter(visible)
      .filter((element) => element.scrollHeight > element.clientHeight + 120)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.height * br.width + b.scrollHeight) - (ar.height * ar.width + a.scrollHeight);
      });

    return candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left > 250 && rect.width > 300;
    }) || document.scrollingElement || document.documentElement;
  }

  function scrollCommentList() {
    const amount = Math.round(window.innerHeight * 0.75);
    const container = findScrollContainer();

    if (container === document.scrollingElement || container === document.documentElement || container === document.body) {
      window.scrollBy({ top: amount, behavior: "smooth" });
    } else {
      container.scrollBy({ top: amount, behavior: "smooth" });
    }
  }

  async function selectComments(limit) {
    let selected = 0;
    let staleScrolls = 0;
    const clickedThisCycle = new WeakSet();

    while (state.running && selected < limit && staleScrolls < 12) {
      const before = selected;
      const checkboxes = findCommentCheckboxes(clickedThisCycle).slice(0, limit - selected);

      for (const checkbox of checkboxes) {
        if (!state.running || selected >= limit) break;
        clickedThisCycle.add(checkbox);
        clickElement(checkbox);
        selected += 1;
        await sleep(300);
      }

      if (selected >= limit) break;

      scrollCommentList();
      await sleep(1000);
      staleScrolls = selected === before ? staleScrolls + 1 : 0;
    }

    return selected;
  }

  async function clickConfirmDelete() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 10000 && state.running) {
      let modalButton = null;
      let foundViaDialog = false;
      let foundViaFallback = false;

      // Helper: pega o texto "principal" do elemento (primeiro nao-vazio
      // entre innerText, textContent e aria-label). Diferente de textOf(),
      // que junta todos, isso nao conflita quando o botao tem aria-label
      // diferente do texto visivel.
      const primaryText = (el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || "")
        .toLowerCase()
        .trim();

      const isExcluirButton = (el) => {
        const t = primaryText(el);
        return matchesAny(t, TEXT.delete) || matchesAny(t, TEXT.deleteWithComment);
      };

      // 1) Procura o botao "excluir" dentro de qualquer dialog/modal.
      const allDialogs = Array.from(new Set(
        document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true']")
      ));

      for (const dialog of allDialogs) {
        const style = window.getComputedStyle(dialog);
        if (style.display === "none" || style.visibility === "hidden") continue;

        const dialogButtons = Array.from(dialog.querySelectorAll("button, [role='button'], a"))
          .filter(visible)
          .filter(isExcluirButton);

        if (dialogButtons.length > 0) {
          modalButton = dialogButtons[dialogButtons.length - 1];
          foundViaDialog = true;
          break;
        }
      }

      // 2) Fallback: o MAIOR botao "excluir" visivel.
      if (!modalButton) {
        const candidates = Array.from(document.querySelectorAll("button, [role='button'], a"))
          .filter(visible)
          .filter(isExcluirButton);

        modalButton = candidates
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (br.width * br.height) - (ar.width * ar.height);
          })[0];
        foundViaFallback = !!modalButton;
      }

      const btnInfo = modalButton
        ? modalButton.tagName + " '" + primaryText(modalButton) + "' " + JSON.stringify(modalButton.getBoundingClientRect())
        : "null";
      console.log("[ICC] clickConfirmDelete: dialogs=" + allDialogs.length + " viaDialog=" + foundViaDialog + " viaFallback=" + foundViaFallback + " btn=" + btnInfo);

      if (modalButton) {
        modalButton.scrollIntoView({ block: "center", inline: "center" });
        await sleep(150);
        debugHighlight(modalButton, 1200);
        clickAtCenter(modalButton, { cleanClick: true });
        await sleep(500);
        return true;
      }

      await sleep(250);
    }

    console.log("[ICC] clickConfirmDelete: timeout, nenhum botao 'Excluir' encontrado");
    return false;
  }

  function findActionDeleteButton() {
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],[aria-label]"))
      .filter(visible)
      .filter((element) => matchesAny(textOf(element), TEXT.delete) || matchesAny(element.getAttribute("aria-label"), TEXT.delete))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width <= 180 && rect.height <= 80;
      })
      .sort((a, b) => {
        const aRole = a.getAttribute("role") === "button" ? 1 : 0;
        const bRole = b.getAttribute("role") === "button" ? 1 : 0;
        const aAria = matchesAny(a.getAttribute("aria-label"), TEXT.delete) ? 1 : 0;
        const bAria = matchesAny(b.getAttribute("aria-label"), TEXT.delete) ? 1 : 0;
        return (bRole + bAria) - (aRole + aAria);
      });

    return candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }) || candidates[0] || null;
  }

  async function clickActionDelete(timeoutMs = 7000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs && state.running) {
      const button = findActionDeleteButton();
      if (button) {
        clickAtCenter(button);
        await sleep(600);
        return true;
      }

      window.scrollBy({ top: -Math.round(window.innerHeight * 0.5), behavior: "smooth" });
      await sleep(500);
    }

    return false;
  }

  async function runCycle() {
    if (!state.running) return;

    const options = state.options;

    await clickText([(text) => matchesAny(text, TEXT.cancel)], 1000);

    const selectButton = await clickText([
      (text) => matchesAny(text, TEXT.select),
      (text) => (text.includes("selecionar") || text.includes("select")) && !matchesAny(text, TEXT.selectAll)
    ]);
    if (!selectButton) return scheduleNext(options.delaySeconds);

    const selected = await selectComments(options.batchSize);
    if (!selected) return scheduleNext(options.delaySeconds);

    const deleteButton = await clickActionDelete();
    if (!deleteButton) return scheduleNext(options.delaySeconds);

    await clickConfirmDelete();

    // Espera o modal de confirmacao fechar (ate ~5s). O dispatchEvent do
    // click no botao Excluir as vezes dispara a acao de deletar mas nao
    // fecha o modal, entao precisamos aguardar e, se nao fechar, forcar.
    for (let i = 0; i < 25 && state.running; i++) {
      await sleep(200);
      if (!isModalOpen()) break;
    }
    if (isModalOpen()) {
      console.log("[ICC] runCycle: modal nao fechou sozinho, forçando fechamento");
      await forceCloseModal();
    }

    await waitForListReady(RELOAD_WAIT_MS);
    scheduleNext(options.delaySeconds);
  }

  function scheduleNext(seconds) {
    clearTimeout(state.timer);
    if (!state.running) {
      state.nextActionAt = null;
      return;
    }
    state.nextActionAt = Date.now() + seconds * 1000;
    state.timer = setTimeout(() => {
      state.nextActionAt = null;
      runCycle();
    }, seconds * 1000);
  }

  async function start(options) {
    state.options = {
      batchSize: Number(options.batchSize) || DEFAULTS.batchSize,
      delaySeconds: Number(options.delaySeconds) || DEFAULTS.delaySeconds
    };
    state.running = true;
    state.nextActionAt = Date.now();
    await chrome.storage.local.set({ ...state.options, running: true });
    clearTimeout(state.timer);
    runCycle();
  }

  async function stop() {
    state.running = false;
    state.nextActionAt = null;
    clearTimeout(state.timer);
    await chrome.storage.local.set({ running: false });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ICC_START") {
      start(message.options || DEFAULTS).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message?.type === "ICC_STOP") {
      stop().then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message?.type === "ICC_GET_STATE") {
      sendResponse({
        running: state.running,
        nextActionAt: state.nextActionAt
      });
      return true;
    }

    return false;
  });

  chrome.storage.local.get(DEFAULTS).then((stored) => {
    if (stored.running) start(stored);
  });
})();
