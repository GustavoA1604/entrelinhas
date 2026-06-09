// Inline, collapsible "Como jogar?" section. Replaces the old "?" help dialogs
// with always-visible rules plus static board "screenshots" built from the real
// board styles. Mounted in the menu and in each game view; the collapsed state
// is a single preference shared across all instances and persisted.

import { readJSON, writeJSON } from "./storage.js";

const STORAGE_KEY = "entrelinhas:howto-collapsed";

// A static board mock reuses the live board markup/classes so it always matches
// the real thing. These are illustrative words/distances, not a real puzzle.
const CLASSIC_BODY = `
  <p class="howto-lead">
    Seu objetivo é descobrir uma <b>palavra secreta</b> de 5 letras.
  </p>

  <div class="howto-step">
    <div class="board howto-board">
      <div class="row bound-sentinel"><span class="word">aaaaa</span><span class="tag">?? palavras</span></div>
      <div class="row target target-hidden"><span class="word">?????</span><span class="tag">secreta</span></div>
      <div class="row bound-sentinel"><span class="word">zzzzz</span><span class="tag">?? palavras</span></div>
    </div>
    <p class="howto-caption">A <b>palavra secreta</b> pode ser qualquer palavra válida do dicionário. No início, você não tem nenhuma informação de onde ela está. Faça um palpite qualquer para descobrir onde ela se encontra no alfabeto! Por exemplo, comece com <code>LAGOS</code>:</p>
  </div>

  <div class="howto-step">
    <div class="board howto-board">
      <div class="row bound-guess lower"><span class="word">LAGOS</span><span class="tag">1.163 palavras</span></div>
      <div class="row target target-hidden"><span class="word">?????</span><span class="tag">secreta</span></div>
      <div class="row bound-sentinel"><span class="word">zzzzz</span><span class="tag">?? palavras</span></div>
    </div>
    <p class="howto-caption">
      Você percebeu que <code>LAGOS</code> virou o limite de cima, ou seja, a <b>palavra secreta</b> vem depois de "LAGOS" no alfabeto. Além disso, você consegue ver também que há 1.163 palavras entre elas. Quanto menor esse número, mais perto da resposta você está! Continue fazendo tentativas para descobrir os limites alfabéticos da <b>palavra secreta</b>. Por exemplo, se você tentar <code>SAMBA</code>:
    </p>
  </div>

  <div class="howto-step">
    <div class="board howto-board">
      <div class="row bound-guess lower"><span class="word">LAGOS</span><span class="tag">1.163 palavras</span></div>
      <div class="row target target-hidden"><span class="word">?????</span><span class="tag">secreta</span></div>
      <div class="row bound-guess upper"><span class="word">samba</span><span class="tag">498 palavras</span></div>
    </div>
    <p class="howto-caption">
      <code>SAMBA</code> virou o limite de baixo, então alfabeticamente vem depois da <b>palavra secreta</b>. Além disso, está mais perto da palavra secreta que <code>LAGOS</code>, já que 498 é menor que 1.163. Continue fazendo tentativas usando a distância entre a <b>palavra secreta</b> e os limites inferior e superior até acertar a palavra:
    </p>
  </div>

  <div class="howto-step">
    <div class="board howto-board">
      <div class="row target target-revealed-win"><span class="word">prato</span><span class="tag">acertou!</span></div>
    </div>
  </div>

  <p class="howto-note">
    Caso esteja sem ideias de palpites, use o botão <strong>💡</strong> para liberar dicas sobre a <b>palavra secreta</b>.
  </p>
`;

const CROSSWORD_BODY = `
  <p class="howto-lead">
    O modo Cruzadas funciona de modo similar ao Clássico, mas você deve adivinhar 5 palavras em vez de apenas uma. Se ainda não jogou o clássico, é recomendável jogar pelo menos uma partida para se familiarizar com o jogo!
  </p>
  
  <p class="howto-lead">  
    A medida que for acertando palavras, use o diagrama de palavras cruzadas para ganhar dicas sobre as letras das palavras restantes.
  </p>

  <div class="howto-step">
    <div class="howto-cw-diagram">
      <div class="howto-cw-board" aria-hidden="true">
        <div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div>
        <div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div>
        <div class="cw-cell cw-solved">m</div><div class="cw-cell cw-solved">o</div><div class="cw-cell cw-solved">n</div><div class="cw-cell cw-solved">t</div><div class="cw-cell cw-solved">e</div>
        <div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell"></div>
        <div class="cw-cell"></div><div class="cw-cell"></div><div class="cw-cell"></div><div class="cw-cell"></div><div class="cw-cell"></div>
        <div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div>
        <div class="cw-cell"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div><div class="cw-cell cw-empty"></div>
      </div>
      <div class="cw-list howto-cwlist">
        <div class="cw-row cw-sentinel"><span class="word">aaaaa</span><span class="tag">?? palavras</span></div>
        <div class="cw-row cw-group"><span class="word">?????</span><span class="tag">1 secreta</span></div>
        <div class="cw-row cw-guess"><span class="word">farto</span><span class="tags"><span class="tag tag-up">↑ 30 palavras</span><span class="tag tag-down">↓ 242 palavras</span></span></div>
        <div class="cw-row cw-group"><span class="word">?????</span><span class="tag">2 secretas</span></div>
        <div class="cw-row cw-guess cw-guess-solved"><span class="word"><span class="cw-guess-check">✓</span> monte</span><span class="tags"><span class="tag tag-up">↑ 533 palavras</span><span class="tag tag-down">↓ 92 palavras</span></span></div>
        <div class="cw-row cw-group"><span class="word">?????</span><span class="tag">1 secreta</span></div>
        <div class="cw-row cw-sentinel"><span class="word">zzzzz</span><span class="tag">?? palavras</span></div>
      </div>
    </div>
    <p class="howto-caption">
      Cada <code>?????</code> mostra quantas palavras secretas ainda existem naquela faixa. Tentativas já feitas mostram
      a distância até a palavra secreta mais próxima acima (↑) e/ou abaixo (↓) dela. Ao acertar, a secreta ganha um
      <strong>✓</strong> e vira um novo limite para as faixas vizinhas, além de aparecer destacada em verde no diagrama.
    </p>
  </div>

  <p class="howto-note">
    Assim como no modo clássico, tentativas fora dos limites já descobertos são bloqueados. Você tem 50 tentativas para acertar todas as 5 palavras. O botão <strong>💡</strong> dá até 3 dicas: você escolhe uma letra do tabuleiro para revelar.
  </p>
`;

function bodyFor(mode) {
  if (mode === "classic") return CLASSIC_BODY;
  if (mode === "crossword") return CROSSWORD_BODY;
  // "both": the menu hub explains each mode in its own labelled block.
  return `
    <div class="howto-mode">
      <h3 class="howto-mode-title">Clássico</h3>
      ${CLASSIC_BODY}
    </div>
    <div class="howto-mode">
      <h3 class="howto-mode-title">Palavras Cruzadas</h3>
      ${CROSSWORD_BODY}
    </div>
  `;
}

export function initHowTo() {
  const sections = [...document.querySelectorAll("[data-howto]")];
  if (sections.length === 0) return;

  let collapsed = readJSON(STORAGE_KEY) === true;

  const apply = () => {
    for (const sec of sections) {
      sec.classList.toggle("collapsed", collapsed);
      const header = sec.querySelector(".howto-header");
      if (header) header.setAttribute("aria-expanded", String(!collapsed));
    }
  };

  for (const sec of sections) {
    sec.innerHTML = `
      <button type="button" class="howto-header" aria-expanded="true">
        <span class="howto-title">Como jogar?</span>
        <span class="howto-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="howto-body">${bodyFor(sec.getAttribute("data-howto"))}</div>
    `;
    sec.querySelector(".howto-header").addEventListener("click", () => {
      collapsed = !collapsed;
      writeJSON(STORAGE_KEY, collapsed);
      apply();
    });
  }

  apply();
}
