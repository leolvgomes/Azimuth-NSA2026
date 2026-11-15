/**
 * Conteúdo da tela "Sobre" (o que é, por que fizemos, dados, como funciona, time) e do tutorial
 * interativo. Textos bilíngues (inglês = padrão). Trocar nome/cargo do time = mudar este arquivo.
 * Fontes: página do desafio NASA Space Apps 2026, docs/briefing.md e a descrição do projeto (Clara).
 */
import type { Lang } from './i18n';

type L<T = string> = Record<Lang, T>;

/* ------------------------------------------------------------------ time */
export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: L;
  /** Destaque curto (ex.: "Team owner"). */
  badge?: L;
  /** O que a pessoa fez no projeto (verso do cartão). */
  focus: L<string[]>;
}

export const team: TeamMember[] = [
  {
    id: 'leo',
    name: 'Leonardo Gomes',
    initials: 'LG',
    role: { en: 'Software Engineering', pt: 'Engenharia de Software' },
    badge: { en: 'Team owner', pt: 'Líder do time' },
    focus: {
      en: ['System architecture', 'NASA data pipeline', 'Route engine (A*, O₂, point of no return)', 'Azimuth AI assistant'],
      pt: ['Arquitetura do sistema', 'Pipeline de dados NASA', 'Motor de rotas (A*, O₂, ponto sem retorno)', 'Assistente de IA Azimuth'],
    },
  },
  {
    id: 'joao',
    name: 'João Pedro',
    initials: 'JP',
    role: { en: 'Software Engineering', pt: 'Engenharia de Software' },
    focus: {
      en: ['Interactive 3D Mars opening', 'About screen and guided tutorial', 'Interface and experience polish'],
      pt: ['Abertura 3D interativa de Marte', 'Tela Sobre e tutorial guiado', 'Refinamento de interface e experiência'],
    },
  },
  {
    id: 'clara',
    name: 'Maria Clara',
    initials: 'MC',
    role: { en: 'Civil Engineering', pt: 'Engenharia Civil' },
    focus: {
      en: ['Product concept and mission briefing', 'Interface design (Figma)', 'Project write-up, references and video'],
      pt: ['Conceito do produto e briefing da missão', 'Design da interface (Figma)', 'Documento do projeto, referências e vídeo'],
    },
  },
];

/* ------------------------------------------------------------ tela Sobre */
export type DataStatus = 'real' | 'approx' | 'estimate' | 'sample';

export interface AboutCopy {
  open: string;
  tutorial: string;
  close: string;
  prev: string;
  next: string;
  sections: string[];
  what: {
    eyebrow: string;
    title: string;
    lead: string;
    questions: { q: string; a: string }[];
    tapHint: string;
    placeLabel: string;
    place: string;
    placeWhy: string;
    aiLabel: string;
    ai: string;
  };
  why: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    quote: string;
    quoteSource: string;
    checklistTitle: string;
    checklist: { need: string; answer: string }[];
    /** Rótulos dos contadores: tipos de dado, fotos, alvos científicos, pessoas. */
    stats: string[];
  };
  data: {
    eyebrow: string;
    title: string;
    lead: string;
    fields: { source: string; shows: string; use: string };
    items: { id: string; type: string; source: string; shows: string; use: string; status: DataStatus }[];
    status: Record<DataStatus, string>;
    honesty: string;
  };
  how: {
    eyebrow: string;
    title: string;
    steps: { name: string; detail: string }[];
    rulesTitle: string;
    rules: string[];
    stack: string;
  };
  teamSec: {
    eyebrow: string;
    title: string;
    lead: string;
    flipHint: string;
    ctaTitle: string;
    ctaBody: string;
    ctaTour: string;
    ctaMap: string;
  };
}

export const aboutCopy: L<AboutCopy> = {
  en: {
    open: 'ABOUT',
    tutorial: 'TUTORIAL',
    close: 'CLOSE',
    prev: 'BACK',
    next: 'NEXT',
    sections: ['What it is', 'Why we built it', 'NASA data', 'How it works', 'Team'],
    what: {
      eyebrow: 'AZIMUTH · INTERPLANETARY GUIDE',
      title: 'A survival map for the first humans on Mars',
      lead:
        'Azimuth is a layered, navigable map of Jezero Crater that shows a Mars astronaut the safest route, and always the way home.',
      questions: [
        { q: 'Can I go this way?', a: 'Terrain, slope, hazards and surface temperature read along the exact route, from orbital NASA data.' },
        { q: 'Will my suit hold?', a: 'Oxygen, battery and the suit temperature range checked against every metre of the walk. Problems become alerts at the exact spot.' },
        { q: 'How do I get back?', a: 'Rescue mode, one tap from anywhere: the way home, the point of no return and the nearest shelter.' },
      ],
      tapHint: 'TAP A QUESTION',
      placeLabel: 'WHERE',
      place: 'Jezero Crater · 18.44° N, 77.45° E',
      placeWhy:
        'An ancient lake with a river delta, one of the best places on Mars to look for signs of past life, and the area Perseverance has explored since 2021.',
      aiLabel: 'THE AI GUIDE',
      ai: 'Azimuth is also the name of the assistant. Ask "take me to the delta" and it traces the routes on the map. It never invents numbers: it calls the site\'s own calculations and explains them.',
    },
    why: {
      eyebrow: 'NASA SPACE APPS CHALLENGE 2026',
      title: 'Interplanetary Survival Guide: Martian Map',
      paragraphs: [
        'NASA has explored Mars robotically for decades. The first astronauts to walk there will need the best map possible: routes, destinations, current conditions and the data to finish the mission quickly and safely.',
        'Tools like JPL\'s Mars Trek and the USGS geologic maps already layer data over the whole planet, but they are built for regional and global views, not for the few kilometres an astronaut covers on a single Marswalk.',
        'So, during the Space Apps hackathon weekend (14–15 November 2026), our team of three built a hyperlocal, layered map of one place: Jezero Crater.',
      ],
      quote: 'NASA\'s first priority is always astronaut safety.',
      quoteSource: 'Challenge brief, NASA Space Apps 2026',
      checklistTitle: 'WHAT THE CHALLENGE ASKS · HOW WE ANSWER',
      checklist: [
        { need: 'At least three kinds of NASA data', answer: 'Eight: optical, elevation, thermal, minerals, geology, landforms, atmosphere and radiation.' },
        { need: 'Astronaut safety first', answer: 'Every route is checked against the suit, every alert says what to do, and Rescue is one tap away.' },
        { need: 'A route that avoids obstacles', answer: 'An A* search over a cost map of slope, hazards and cold proposes the safest, fastest and balanced routes.' },
        { need: 'Rover point-of-view imagery', answer: '13 real Perseverance photos pinned where they were taken and shown along the route.' },
        { need: 'Science along the way', answer: '11 science targets (carbonates, olivine, sample sites) can be added as stops, with their working time.' },
        { need: 'Robots helping the crew', answer: 'Scout, relay and rescue robots as a concept: Azimuth suggests, the astronaut confirms.' },
      ],
      stats: ['NASA DATA TYPES', 'ROVER PHOTOS', 'SCIENCE TARGETS', 'CREW MEMBERS'],
    },
    data: {
      eyebrow: 'LAYERED NASA DATA',
      title: 'Eight data types, one map',
      lead: 'Pick a layer to see where it comes from and how Azimuth uses it.',
      fields: { source: 'Source', shows: 'Shows', use: 'In Azimuth' },
      items: [
        { id: 'optical', type: 'Optical', source: 'MRO CTX mosaic, 6 m per pixel', shows: 'The terrain itself', use: 'Base of the map, with zoom', status: 'real' },
        { id: 'elevation', type: 'Elevation', source: 'USGS CTX DTM 20 m · MOLA', shows: 'Altitude and slope', use: 'Slope along the route and route cost', status: 'real' },
        { id: 'thermal', type: 'Thermal', source: 'THEMIS infrared, day and night', shows: 'Approximate surface temperature', use: 'Compared with the suit temperature range', status: 'approx' },
        { id: 'minerals', type: 'Minerals', source: 'CRISM carbonate index', shows: 'Carbonates and other minerals', use: 'Science stops', status: 'real' },
        { id: 'geology', type: 'Geology', source: 'USGS Astrogeology', shows: 'Geologic units and dunes', use: 'Terrain context', status: 'real' },
        { id: 'landforms', type: 'Landforms', source: 'Mars Trek named landforms', shows: 'Channels, breach, delta, dunes', use: 'Hazard zones the routes avoid', status: 'real' },
        { id: 'atmosphere', type: 'Atmosphere', source: 'Perseverance MEDA', shows: 'Air temperature and pressure', use: 'Values in the route dossier', status: 'sample' },
        { id: 'radiation', type: 'Radiation', source: 'Curiosity RAD', shows: 'Dose on the Martian surface', use: 'Estimate shown on the route', status: 'estimate' },
      ],
      status: { real: 'REAL DATA', approx: 'APPROXIMATE', estimate: 'ESTIMATE', sample: 'TYPICAL VALUES' },
      honesty:
        'Rover track and photos: NASA/JPL-Caltech. Suit oxygen, battery and temperature are simulated and labelled SAMPLE DATA on screen.',
    },
    how: {
      eyebrow: 'FROM PLAN TO HOME',
      title: 'How Azimuth works',
      steps: [
        { name: 'Plan', detail: 'Draw a route on the map, or ask Azimuth to trace one ("take me to the delta").' },
        { name: 'Route dossier', detail: 'Each data layer is read along the line: terrain and slope, temperature, minerals, geology, hazards, radiation.' },
        { name: 'Check the suit', detail: 'The route is compared with the suit temperature range, remaining oxygen and battery.' },
        { name: 'Alerts', detail: 'A section too cold, too steep or too long for the oxygen left becomes an alert at that spot, with what to do.' },
        { name: 'Route options', detail: 'Safest, fastest and balanced side by side, with distance, time, oxygen left and alerts.' },
        { name: 'Walk', detail: 'Position, what is ahead, nearby rover photos and the distance to the point of no return.' },
        { name: 'Rescue', detail: 'One big button: the way back, the point of no return and the nearest shelter.' },
      ],
      rulesTitle: 'THREE RULES KEEP THE AI SAFE',
      rules: [
        'Calculations run in the site\'s code; the AI only calls them and explains the result.',
        'It suggests, the astronaut confirms, before any action such as calling a rover.',
        'If data is missing, it says so.',
      ],
      stack: 'Built with Next.js, Leaflet, Three.js and Gemini function calling. Works offline with a pre-written plan B.',
    },
    teamSec: {
      eyebrow: 'THE CREW',
      title: 'Three people, one weekend',
      lead: 'Built during NASA Space Apps 2026 by a team of three.',
      flipHint: 'HOVER OR TAP A CARD',
      ctaTitle: 'Ready to walk on Mars?',
      ctaBody: 'The interactive tutorial runs on the real app: you plan, check and walk a route yourself, step by step.',
      ctaTour: 'START INTERACTIVE TUTORIAL ▸',
      ctaMap: 'GO TO THE MAP',
    },
  },
  pt: {
    open: 'SOBRE',
    tutorial: 'TUTORIAL',
    close: 'FECHAR',
    prev: 'VOLTAR',
    next: 'PRÓXIMO',
    sections: ['O que é', 'Por que fizemos', 'Dados da NASA', 'Como funciona', 'Time'],
    what: {
      eyebrow: 'AZIMUTH · INTERPLANETARY GUIDE',
      title: 'Um mapa de sobrevivência para os primeiros humanos em Marte',
      lead:
        'Azimuth é um mapa navegável e em camadas da Cratera Jezero que mostra ao astronauta a rota mais segura e sempre o caminho de volta.',
      questions: [
        { q: 'Posso ir por aqui?', a: 'Relevo, inclinação, perigos e temperatura da superfície lidos ao longo da rota exata, com dados orbitais da NASA.' },
        { q: 'O traje aguenta?', a: 'Oxigênio, bateria e faixa de temperatura do traje comparados com cada metro da caminhada. Problema vira alerta no ponto exato.' },
        { q: 'Como eu volto?', a: 'Modo Resgate, a um toque de qualquer tela: o caminho de volta, o ponto sem retorno e o abrigo mais próximo.' },
      ],
      tapHint: 'TOQUE EM UMA PERGUNTA',
      placeLabel: 'ONDE',
      place: 'Cratera Jezero · 18,44° N, 77,45° L',
      placeWhy:
        'Um antigo lago com delta de rio, um dos melhores lugares de Marte para procurar sinais de vida passada, e a área que o Perseverance explora desde 2021.',
      aiLabel: 'A GUIA DE IA',
      ai: 'Azimuth também é o nome da assistente. Peça "me leve até o delta" e ela traça as rotas no mapa. Ela nunca inventa números: chama os cálculos do próprio site e os explica.',
    },
    why: {
      eyebrow: 'NASA SPACE APPS CHALLENGE 2026',
      title: 'Interplanetary Survival Guide: Martian Map',
      paragraphs: [
        'A NASA explora Marte com robôs há décadas. Os primeiros astronautas a caminhar lá vão precisar do melhor mapa possível: rotas, destinos, condições atuais e os dados para cumprir a missão com rapidez e segurança.',
        'Ferramentas como o Mars Trek do JPL e os mapas geológicos do USGS já sobrepõem dados ao planeta inteiro, mas foram feitas para visões regionais e globais, não para os poucos quilômetros de uma única caminhada.',
        'Então, no fim de semana do hackathon Space Apps (14 e 15 de novembro de 2026), nosso time de três pessoas construiu um mapa hiperlocal e em camadas de um só lugar: a Cratera Jezero.',
      ],
      quote: 'A primeira prioridade da NASA é sempre a segurança do astronauta.',
      quoteSource: 'Texto do desafio, NASA Space Apps 2026',
      checklistTitle: 'O QUE O DESAFIO PEDE · COMO RESPONDEMOS',
      checklist: [
        { need: 'Pelo menos três tipos de dados da NASA', answer: 'Oito: óptico, relevo, térmico, minerais, geologia, formas de relevo, atmosfera e radiação.' },
        { need: 'Segurança do astronauta em primeiro lugar', answer: 'Toda rota é comparada com o traje, todo alerta diz o que fazer e o Resgate está a um toque.' },
        { need: 'Uma rota que desvia de obstáculos', answer: 'Uma busca A* sobre um mapa de custo de inclinação, perigos e frio propõe a rota mais segura, a mais rápida e a equilibrada.' },
        { need: 'Imagens do ponto de vista dos rovers', answer: '13 fotos reais do Perseverance presas onde foram tiradas e mostradas ao longo da rota.' },
        { need: 'Ciência no caminho', answer: '11 alvos científicos (carbonatos, olivina, locais de amostra) podem virar paradas, com o tempo de trabalho.' },
        { need: 'Robôs ajudando a tripulação', answer: 'Robôs batedor, relé e de resgate como conceito: a Azimuth sugere, o astronauta confirma.' },
      ],
      stats: ['TIPOS DE DADO NASA', 'FOTOS DE ROVER', 'ALVOS CIENTÍFICOS', 'PESSOAS NO TIME'],
    },
    data: {
      eyebrow: 'DADOS DA NASA EM CAMADAS',
      title: 'Oito tipos de dado, um mapa',
      lead: 'Escolha uma camada para ver de onde ela vem e como a Azimuth a usa.',
      fields: { source: 'Fonte', shows: 'Mostra', use: 'Na Azimuth' },
      items: [
        { id: 'optical', type: 'Óptico', source: 'Mosaico MRO CTX, 6 m por pixel', shows: 'O terreno em si', use: 'Base do mapa, com zoom', status: 'real' },
        { id: 'elevation', type: 'Relevo', source: 'DTM CTX 20 m do USGS · MOLA', shows: 'Altitude e inclinação', use: 'Inclinação ao longo da rota e custo da rota', status: 'real' },
        { id: 'thermal', type: 'Térmico', source: 'THEMIS infravermelho, dia e noite', shows: 'Temperatura aproximada da superfície', use: 'Comparada com a faixa de temperatura do traje', status: 'approx' },
        { id: 'minerals', type: 'Minerais', source: 'Índice de carbonato do CRISM', shows: 'Carbonatos e outros minerais', use: 'Paradas científicas', status: 'real' },
        { id: 'geology', type: 'Geologia', source: 'USGS Astrogeology', shows: 'Unidades geológicas e dunas', use: 'Contexto do terreno', status: 'real' },
        { id: 'landforms', type: 'Formas de relevo', source: 'Formas nomeadas do Mars Trek', shows: 'Canais, brecha, delta, dunas', use: 'Zonas de perigo que as rotas evitam', status: 'real' },
        { id: 'atmosphere', type: 'Atmosfera', source: 'MEDA do Perseverance', shows: 'Temperatura e pressão do ar', use: 'Valores no dossiê da rota', status: 'sample' },
        { id: 'radiation', type: 'Radiação', source: 'RAD do Curiosity', shows: 'Dose na superfície de Marte', use: 'Estimativa mostrada na rota', status: 'estimate' },
      ],
      status: { real: 'DADO REAL', approx: 'APROXIMADO', estimate: 'ESTIMATIVA', sample: 'VALORES TÍPICOS' },
      honesty:
        'Trilha e fotos do rover: NASA/JPL-Caltech. Oxigênio, bateria e temperatura do traje são simulados e aparecem como DADOS DE EXEMPLO.',
    },
    how: {
      eyebrow: 'DO PLANO ATÉ EM CASA',
      title: 'Como a Azimuth funciona',
      steps: [
        { name: 'Planejar', detail: 'Desenhe a rota no mapa, ou peça à Azimuth para traçá-la ("me leve até o delta").' },
        { name: 'Dossiê da rota', detail: 'Cada camada é lida ao longo da linha: relevo e inclinação, temperatura, minerais, geologia, perigos, radiação.' },
        { name: 'Cruzar com o traje', detail: 'A rota é comparada com a faixa de temperatura do traje, o oxigênio e a bateria restantes.' },
        { name: 'Alertas', detail: 'Um trecho frio, íngreme ou longo demais para o oxigênio vira alerta naquele ponto, dizendo o que fazer.' },
        { name: 'Opções de rota', detail: 'Mais segura, mais rápida e equilibrada lado a lado, com distância, tempo, O₂ que sobra e alertas.' },
        { name: 'Caminhar', detail: 'Posição, o que vem pela frente, fotos de rover próximas e a distância até o ponto sem retorno.' },
        { name: 'Resgate', detail: 'Um botão grande: o caminho de volta, o ponto sem retorno e o abrigo mais próximo.' },
      ],
      rulesTitle: 'TRÊS REGRAS MANTÊM A IA SEGURA',
      rules: [
        'Os cálculos rodam no código do site; a IA só os chama e explica o resultado.',
        'Ela sugere e o astronauta confirma antes de qualquer ação, como chamar um rover.',
        'Se faltar dado, ela diz que não sabe.',
      ],
      stack: 'Feito com Next.js, Leaflet, Three.js e Gemini com chamada de funções. Funciona offline com um plano B de respostas.',
    },
    teamSec: {
      eyebrow: 'A TRIPULAÇÃO',
      title: 'Três pessoas, um fim de semana',
      lead: 'Construído durante o NASA Space Apps 2026 por um time de três.',
      flipHint: 'PASSE O MOUSE OU TOQUE NUM CARTÃO',
      ctaTitle: 'Pronto para caminhar em Marte?',
      ctaBody: 'O tutorial interativo roda no app de verdade: você mesmo planeja, confere e percorre uma rota, passo a passo.',
      ctaTour: 'INICIAR TUTORIAL INTERATIVO ▸',
      ctaMap: 'IR PARA O MAPA',
    },
  },
};

/* ------------------------------------------------------------- tutorial */
export interface TourStepCopy {
  title: string;
  body: string;
  /** O que o usuário deve fazer (passos de ação). */
  task?: string;
  /** Rótulo do botão "faça por mim". */
  assist?: string;
}

export interface TourCopy {
  step: string;
  of: string;
  yourTurn: string;
  waiting: string;
  done: string;
  next: string;
  back: string;
  skip: string;
  exit: string;
  start: string;
  finish: string;
  openAbout: string;
  /** Frase enviada à Azimuth no passo "pergunte". */
  askPhrase: string;
  steps: Record<string, TourStepCopy>;
}

export const tourCopy: L<TourCopy> = {
  en: {
    step: 'STEP',
    of: 'OF',
    yourTurn: 'YOUR TURN',
    waiting: 'Waiting for you…',
    done: 'Done!',
    next: 'NEXT ▸',
    back: '◂',
    skip: 'SKIP STEP',
    exit: 'Exit tutorial',
    start: 'START ▸',
    finish: 'FINISH',
    openAbout: 'ABOUT AZIMUTH',
    askPhrase: 'take me to the delta',
    steps: {
      welcome: {
        title: 'Welcome aboard',
        body: 'This tour runs on the real app. Each step asks you to actually do something, and moves on when you do. You can skip any step or let us do it for you.',
      },
      map: {
        title: 'This is Jezero Crater',
        body: 'Real MRO CTX imagery at 6 m per pixel, not a picture: a map you can move like any web map.',
        task: 'Zoom the map in or out (mouse wheel or the + / − buttons).',
      },
      layers: {
        title: 'Layer NASA data',
        body: 'Each switch adds one mission\'s data over the crater: relief from MOLA, minerals from CRISM, hazards, rover tracks…',
        task: 'Turn on the Thermal layer (THEMIS infrared).',
        assist: 'Turn it on for me',
      },
      night: {
        title: 'Day or night',
        body: 'Surface temperature drops far below the suit limit after sunset, and the route alerts change with it.',
        task: 'Switch the thermal view to NIGHT.',
        assist: 'Switch for me',
      },
      ask: {
        title: 'Ask Azimuth',
        body: 'The AI guide traces routes for you. It calls the site\'s own calculations, so it never invents a number.',
        task: 'Type "take me to the delta" in the Azimuth bar and press ↑.',
        assist: 'Send it for me',
      },
      options: {
        title: 'Compare the routes',
        body: 'Safest, balanced and fastest side by side: distance, time, oxygen left after the round trip, and number of alerts.',
        task: 'Pick a different route option.',
        assist: 'Pick one for me',
      },
      alerts: {
        title: 'Alerts say what to do',
        body: 'Hazards show in salmon, always visible, tied to the exact segment of the route, and each one ends with an action, not just a warning.',
      },
      dossier: {
        title: 'The route dossier',
        body: 'Elevation profile, science stops along the way, and every data layer read along the line: slope, temperature, minerals, radiation, air.',
      },
      suit: {
        title: 'Your suit, live',
        body: 'Oxygen, battery and suit temperature (SAMPLE DATA). Routes, alerts and the point of no return are recalculated from them instantly.',
        task: 'Drag the OXYGEN slider and watch the numbers change.',
        assist: 'Lower it for me',
      },
      walk: {
        title: 'Start walking',
        body: 'Walk mode follows you along the route: what is ahead, rover photos nearby, and the distance to the point of no return.',
        task: 'Press WALK.',
        assist: 'Start walking for me',
      },
      clock: {
        title: 'Run the mission clock',
        body: 'The walk is simulated: time runs, oxygen and battery drain, and Azimuth warns you before the point of no return.',
        task: 'Press PLAY (try the 16× speed).',
        assist: 'Play for me',
      },
      rescue: {
        title: 'One tap to safety',
        body: 'Something went wrong? From any screen, the RESCUE button switches to the way home.',
        task: 'Press RESCUE.',
        assist: 'Trigger rescue for me',
      },
      home: {
        title: 'The way home',
        body: 'Return route to the nearest shelter, time to get there, oxygen needed with a safety margin, and whether you already passed the point of no return.',
      },
      robots: {
        title: 'Support robots (concept)',
        body: 'Azimuth can call a scout, relay or rescue robot, but only after you confirm. Robots never move on their own.',
      },
      done: {
        title: 'You know the way home',
        body: 'That is the whole flow: plan, check, walk and come back. Explore freely. You can reopen this tutorial from the ? button at the top.',
      },
    },
  },
  pt: {
    step: 'PASSO',
    of: 'DE',
    yourTurn: 'SUA VEZ',
    waiting: 'Esperando você…',
    done: 'Feito!',
    next: 'PRÓXIMO ▸',
    back: '◂',
    skip: 'PULAR PASSO',
    exit: 'Sair do tutorial',
    start: 'COMEÇAR ▸',
    finish: 'CONCLUIR',
    openAbout: 'SOBRE A AZIMUTH',
    askPhrase: 'me leve até o delta',
    steps: {
      welcome: {
        title: 'Bem-vindo a bordo',
        body: 'Este tutorial roda no app de verdade. Cada passo pede que você faça algo, e avança quando você faz. Dá para pular qualquer passo ou deixar que a gente faça por você.',
      },
      map: {
        title: 'Esta é a Cratera Jezero',
        body: 'Imagem real do MRO CTX a 6 m por pixel, não uma foto: um mapa que você move como qualquer mapa da web.',
        task: 'Dê zoom no mapa (roda do mouse ou os botões + / −).',
      },
      layers: {
        title: 'Camadas de dados da NASA',
        body: 'Cada chave adiciona os dados de uma missão sobre a cratera: relevo do MOLA, minerais do CRISM, perigos, trilhas dos rovers…',
        task: 'Ligue a camada Térmica (infravermelho THEMIS).',
        assist: 'Ligar para mim',
      },
      night: {
        title: 'Dia ou noite',
        body: 'Depois do pôr do sol a temperatura da superfície cai muito abaixo do limite do traje, e os alertas da rota mudam junto.',
        task: 'Troque a visão térmica para NOITE.',
        assist: 'Trocar para mim',
      },
      ask: {
        title: 'Pergunte à Azimuth',
        body: 'A guia de IA traça rotas para você. Ela chama os cálculos do próprio site, então nunca inventa um número.',
        task: 'Digite "me leve até o delta" na barra da Azimuth e aperte ↑.',
        assist: 'Enviar para mim',
      },
      options: {
        title: 'Compare as rotas',
        body: 'Mais segura, equilibrada e mais rápida lado a lado: distância, tempo, oxigênio que sobra na ida e volta e número de alertas.',
        task: 'Escolha outra opção de rota.',
        assist: 'Escolher para mim',
      },
      alerts: {
        title: 'Alertas dizem o que fazer',
        body: 'Perigos aparecem em salmão, sempre visíveis, presos ao trecho exato da rota, e cada um termina com uma ação, não só um aviso.',
      },
      dossier: {
        title: 'O dossiê da rota',
        body: 'Perfil de elevação, paradas científicas no caminho e cada camada lida ao longo da linha: inclinação, temperatura, minerais, radiação, ar.',
      },
      suit: {
        title: 'Seu traje, ao vivo',
        body: 'Oxigênio, bateria e temperatura do traje (DADOS DE EXEMPLO). Rotas, alertas e o ponto sem retorno são recalculados na hora.',
        task: 'Arraste o controle de OXIGÊNIO e veja os números mudarem.',
        assist: 'Baixar para mim',
      },
      walk: {
        title: 'Comece a caminhar',
        body: 'O modo Caminhar acompanha você na rota: o que vem pela frente, fotos de rover próximas e a distância até o ponto sem retorno.',
        task: 'Aperte CAMINHAR.',
        assist: 'Caminhar para mim',
      },
      clock: {
        title: 'Ligue o relógio da missão',
        body: 'A caminhada é simulada: o tempo corre, oxigênio e bateria caem, e a Azimuth avisa antes do ponto sem retorno.',
        task: 'Aperte PLAY (experimente a velocidade 16×).',
        assist: 'Dar play para mim',
      },
      rescue: {
        title: 'Um toque para a segurança',
        body: 'Deu algo errado? De qualquer tela, o botão RESGATE troca para o caminho de volta.',
        task: 'Aperte RESGATE.',
        assist: 'Acionar resgate para mim',
      },
      home: {
        title: 'O caminho de volta',
        body: 'Rota de volta ao abrigo mais próximo, tempo até lá, oxigênio necessário com margem de segurança e se você já passou do ponto sem retorno.',
      },
      robots: {
        title: 'Robôs de apoio (conceito)',
        body: 'A Azimuth pode chamar um robô batedor, relé ou de resgate, mas só depois que você confirma. Os robôs nunca agem sozinhos.',
      },
      done: {
        title: 'Você sabe o caminho de volta',
        body: 'Esse é o fluxo inteiro: planejar, conferir, caminhar e voltar. Explore à vontade. Dá para reabrir este tutorial pelo botão ? no topo.',
      },
    },
  },
};
