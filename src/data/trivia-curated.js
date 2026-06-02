// Hand-written trivia. NOT auto-generated, can be edited freely.
// Keep each entry to one short sentence and avoid volatile numbers (those are
// generated into trivia-stats.js so they never drift). See src/trivia.js.

// Generic Brazilian-Portuguese spelling/usage rules.
export const WRITING_RULES = [
  "Antes de P e B usa-se sempre M, nunca N.",
  "Palavras terminadas em -L formam o plural trocando o L por IS: 'animal' vira 'animais'.",
  "'Mas' indica oposição (= porém); 'mais' indica quantidade.",
  "Antes de E e I, o som de /k/ escreve-se com QU; antes de A, O, U, com C.",
  "Em português, RR e SS nunca começam uma palavra. Só aparecem entre vogais.",
  "Use 'porque' (junto) para responder e 'por que' (separado) para perguntar.",
  "'Há' indica tempo passado ('há dois dias'); 'a' indica tempo futuro ('daqui a dois dias').",
  "Nenhuma palavra em português começa com Ç.",
  "O dígrafo QU costuma ter som de K antes de E e I: 'quero', 'quilo'.",
  "Depois de M só vêm P e B; em outros casos, o som nasal usa N: 'ponte', 'canto'.",
  "Para manter o som de G forte antes de E e I, usa-se GU: 'guerra', 'guia'.",
  "'Mau' é o contrário de bom (adjetivo); 'mal' é o contrário de bem (advérbio).",
  "'Onde' indica lugar parado; 'aonde' indica movimento: 'aonde você vai?'.",
  "O Ç só aparece antes de A, O e U; antes de E e I, usa-se C: 'caçar', mas 'cidade'.",
  "Entre vogais, o S costuma ter som de Z: 'casa', 'mesa'.",
  "'Trás' (advérbio de lugar) leva acento; 'traz' é do verbo trazer.",
  "Palavras terminadas em -ÃO fazem plural de várias formas: 'pão' vira 'pães', 'mão' vira 'mãos'.",
  "A letra Q no portugues é sempre sucedida pela letra U.",
];

// How Entrelinhas works (stable mechanics; numeric facts live in trivia-stats).
export const GAME_RULES = [
  "Entrelinhas só enxerga letras de A a Z: acentos são ignorados e o Ç vira C.",
  "Entrelinhas só aceita palavras de exatamente 5 letras.",
  "A palavra do dia é a mesma para todo mundo naquele dia. O mesmo se aplica para o jogo do modo cruzadas.",
  "No modo Clássico você tem 15 tentativas; nas Cruzadas, 50.",
  "A palavra secreta está sempre em ordem alfabética entre os seus dois limites.",
  "Cada palpite diminiu o intervalo de possíveis respostas. Se ele vem antes da palavra secreta, vira o limite de cima; caso contrário, o limite de baixo.",
  "Quanto mais perto a sua palavra estiver da secreta, menos palavras restam entre elas.",
  "Palpites fora dos limites atuais não são aceitos, garantindo que você esteja sempre mais próximo da resposta.",
  "Usar dicas no modo clássico revela as últimas letras da palavra secreta pois são as letras mais difíceis de se ter certeza.",
  "Usar dicas no modo cruzadas permite que você selecione qual letra quer revelar de acordo com sua estratégia de jogo.",
  "Dicas só são disponibilizadas à medida que você chega mais próximo da resposta.",
  "Dicas só são utilizáveis se você está há alguns segundos sem conseguir fazer nenhuma tentativa.",
  "Você pode jogar dias anteriores pelo ícone 📅 no menu.",
  "Você pode jogar o mesmo jogo aleatório de outras pessoas ao usar a mesmo código de geração de jogo.",
];
