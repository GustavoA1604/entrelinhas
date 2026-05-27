# Entrelinhas

Versão em português brasileiro do [Betweenle](https://betweenle.com/), com dois modos de jogo: o clássico (uma palavra) e palavras cruzadas (várias palavras interligadas).

## Modos

Ao abrir o jogo, um menu deixa escolher entre:

- **Clássico** — adivinhe a palavra secreta de 5 letras que está alfabeticamente *entre* dois limites. A cada tentativa, o intervalo se estreita. 15 tentativas.
  - *Palavra do dia*: a mesma palavra para todo mundo, baseada na data.
  - *Aleatório*: jogue quantas vezes quiser.
- **Palavras Cruzadas** — várias palavras secretas (5 por padrão) montadas como num crossword, todas interligadas. À esquerda fica o tabuleiro; à direita, uma lista alfabética dos palpites, mostrando quantas secretas ainda restam acima/abaixo de cada um e a distância em palavras do dicionário até a secreta mais próxima em cada direção. Acertar uma secreta a revela no tabuleiro e a remove da lista. Palpites em faixas já descartadas (fora dos limites ou em gaps com zero secretas) são bloqueados. 50 tentativas.
  - *Cruzadas do dia* e *Aleatório*, mesma lógica do clássico.

Acentos são ignorados em qualquer modo; use apenas `a`–`z`.

### Gerador de cruzadas

As cruzadas são geradas em tempo real a partir de `ANSWERS`, com seed determinística por data no modo diário. O algoritmo é greedy + backtracking: coloca a primeira palavra, depois tenta encaixar cada palavra seguinte cruzando alguma já posicionada num letra compatível, rejeitando posições que criariam adjacências indesejadas. A partir da 4ª palavra o gerador *prefere* posições que formem laços (a palavra cruza duas já posicionadas), caindo de volta para cruzamentos simples quando não há opção de laço. Constantes em `crossword.js`: `NUM_SECRETS`, `MAX_GUESSES`, `GEN_MAX_ATTEMPTS`.

### Compartilhar

O botão "Compartilhar" copia ou envia (via Web Share API) o resultado em texto. No modo cruzadas, o texto inclui o estado atual do tabuleiro em bloco monoespaçado (cercado por <code>\`\`\`</code>), com letras maiúsculas para as secretas resolvidas e `·` para as ainda em aberto.

## Listas de palavras

- `answers.js`: ~2.000 palavras comuns em PT-BR, usadas como respostas (baseado em uma lista do clone PT-BR de Wordle).
- `valid.js`: ~5.500 palavras de 5 letras aceitas como tentativas, mesclando um dicionário PT-BR amplo (acentos removidos).

Para reconstruir as listas, veja a seção "Geração das listas" abaixo.

## Rodando localmente

O jogo usa módulos ES (`import` / `export`), então abrir `index.html` direto pelo `file://` **não funciona**. Suba um servidor estático qualquer.

```bash
# Python 3
python -m http.server 8000

# Node (npx)
npx http-server -p 8000
```

Depois abra <http://localhost:8000>. O menu é a tela inicial; cada modo é uma view separada, alternada via JS. Há suporte a `#classic` e `#crossword` no hash para deep-link.

## Publicando no GitHub Pages

Existem duas formas de hospedar no GitHub Pages:

1. **Site de usuário (`<seu-usuário>.github.io`)**: repositório com esse nome exato, servido na raiz: `https://<seu-usuário>.github.io/`.
2. **Site de projeto (qualquer nome de repo)**: servido em `https://<seu-usuário>.github.io/<nome-do-repo>/`. Foi a opção escolhida.

Passos para a opção 2:

1. Crie um repositório público no GitHub (sugestão: `entrelinhas`).
2. Faça push deste diretório:

   ```bash
   cd D:\dev\entrelinhas
   git init
   git add .
   git commit -m "Versão inicial do Entrelinhas"
   git branch -M main
   git remote add origin https://github.com/<seu-usuário>/entrelinhas.git
   git push -u origin main
   ```

3. No GitHub, vá em **Settings → Pages**:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main` / `/ (root)`
   - Salve.
4. Em ~1 minuto, o site aparece em `https://<seu-usuário>.github.io/entrelinhas/`.

Os arquivos crus `_raw_*.txt` / `_raw_*.json` não são necessários para rodar; você pode adicioná-los ao `.gitignore` ou apagar.

## Estrutura

```
index.html        # marcação das três views (menu / clássico / cruzadas) e diálogos
styles.css        # tema escuro/claro, layout responsivo, modo compacto para telas baixas
app.js            # roteador entre views, inicializa cada modo
game.js           # lógica do modo clássico (módulo ES)
crossword.js      # gerador + lógica do modo cruzadas
answers.js        # ANSWERS: lista de respostas
valid.js          # VALID: Set de palavras aceitas
```

## Geração das listas (referência)

As listas foram geradas a partir destas fontes públicas:

- Respostas: [`vhfarias/omret`](https://github.com/vhfarias/omret), `database/wordList.json` (palavras curadas para clones PT-BR de Wordle).
- Tentativas válidas: [`g-pg/wordle-finder`](https://github.com/g-pg/wordle-finder), `src/data/words.js` (5 letras, sem acentos), complementado pelo dicionário PT-BR de [Ueda](https://www.ime.usp.br/~pf/dicios/).

Processamento aplicado:

1. Remover acentos (NFD + strip de marcas combinantes).
2. Lowercase.
3. Manter apenas `^[a-z]{5}$` (sem hífens, dígitos, nomes próprios).
4. Deduplicar e ordenar.

## Créditos

- Inspirado por [Betweenle](https://betweenle.com/) (Tomás Mediavilla).
- Fontes de palavras: ver acima.
