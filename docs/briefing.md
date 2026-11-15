# Briefing condensado (fonte: PDFs da Clara + página do desafio)

## Desafio NASA
Criar um mapa/ferramenta que um astronauta use numa caminhada em Marte, com pelo menos 3 tipos de dados
da NASA em camadas (óptico, térmico, espectral, topográfico, atmosférico, radiação...). Segurança em
primeiro lugar. Rota que evita obstáculos. Fotos do ponto de vista dos rovers. Rovers/robôs de apoio
são bem-vindos.

## Fluxo do produto (7 passos + abertura)
0. **Abertura**: Marte de perto com "VOCÊ ESTÁ AQUI" → recua para a esfera → gira até Jezero → desce
   até o mapa (fade/zoom para o Leaflet). Nível 3; se faltar tempo, o site começa no mapa.
1. **Planejar**: astronauta desenha a rota clicando, ou pede à Azimuth ("me leve até o delta").
   Cada ponto guarda coordenada e distância.
2. **Dossiê da rota**: relevo/inclinação (MOLA), temperatura (THEMIS dia/noite, seletor), minerais
   (CRISM, carbonatos), geologia (USGS), perigos (canais, brecha, dunas), radiação estimada (RAD).
3. **Cruzar com o traje**: temperatura da rota × faixa do traje; O₂ e bateria × distância.
   Frio demais ou autonomia curta = alerta no trecho exato.
4. **Alertas**: vermelho-salmão #E35D3F, sempre visíveis sem abrir menu. Cada alerta diz o que fazer.
5. **Opções de rota**: 2–3 lado a lado (mais segura, mais rápida, equilibrada) com distância, tempo,
   O₂ que sobra, nº de alertas. Custo por célula (inclinação MOLA, perigos, frio; trilha do rover
   diminui custo) + A*.
6. **Caminhada**: posição, o que vem pela frente, fotos dos rovers perto dali.
7. **Resgate**: botão grande, de qualquer tela: rota de volta, ponto sem retorno (onde o O₂ restante
   só dá para a volta + margem), abrigo mais próximo, robô de resgate a caminho (conceito).

## Assistente Azimuth (IA)
Centro do site. Traça rotas a pedido e desenha no mapa, compara opções, responde por voz ou texto,
explica cada alerta em uma frase, avisa de perigos, fala com os rovers (batedor checa caminho,
chama robô de resgate, pede a foto mais próxima).
Regras: (1) cálculos no código do site, a IA só chama funções e explica; (2) sugere e o astronauta
confirma antes de qualquer ação (ex.: chamar rover); (3) sem dado → diz que não sabe.
Plano B: 4–5 respostas pré-escritas na mesma interface, para o vídeo não depender de rede.
Chave da API só no servidor.

## Interface
Página única. Telas: 1 Início (N3), 2 Mapa (N1, prioridade), 3 Caminhada (N2), 4 Resgate (N2).
Fundo preto, grade, ar de planta de missão, cantos de HUD, Montserrat; títulos largos (Michroma);
destaque #D4FF00; alerta #E35D3F. Barra de conversa fixa embaixo nas telas 2–4 (microfone + texto);
respostas em cartões curtos sobre o mapa, nunca tela cheia. Botões grandes (luva). Resgate a um toque.

## Níveis
- N1: CTX como base no mapa · desenhar rota com cliques + distância · 3 camadas reais (MOLA, THEMIS,
  CRISM; fallback geologia USGS) · painel de dados da rota · faixa do traje com sliders.
- N2: alertas no trecho · opções de rota lado a lado · modo Resgate · trilha do Perseverance ·
  10–15 fotos de rover ligadas a pontos · assistente IA com plano B.
- N3: abertura 3D de Marte · caminhada 3D · ícones dos robôs e chamada de resgate · rastrear objetos.

## Dados
| Camada | Fonte | Como |
|---|---|---|
| Óptica | CTX mosaico Jezero 6 m/px (TIF local), HiRISE | imageOverlay/tiles |
| Relevo | MOLA (Mars Trek WMTS) + DTM CTX 20 m do USGS para números | tiles + grade |
| Térmica | THEMIS IR dia/noite (Mars Trek WMTS) | tiles + grade aproximada |
| Mineral | CRISM (Mars Trek ou Quickmap) | tiles |
| Geologia | USGS Astrogeology (WMS) | tiles |
| Perigos | 8 formas de relevo nomeadas do Mars Trek | GeoJSON à mão |
| Atmosfera | MEDA (Perseverance) | valores no painel |
| Radiação | RAD (Curiosity) | número fixo rotulado como estimativa |
Mars Trek WMTS não pede chave. Tiles são imagens coloridas, não números: para valores na rota, usar raster
bruto ou pré-calcular só a rota de exemplo. Fotos: feed raw images do Perseverance
(mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json), baixar 10–15 e salvar.
Rota de exemplo do demo: base → delta → volta, passando perto de um canal e da brecha oeste
(para o alerta aparecer).

## Entrega
Vídeo ≤ 30 s em inglês (Clara). Site com link público (Vercel). Código no GitHub se pedido.
Créditos na tela. Honestidade: DADOS DE EXEMPLO; radiação = estimativa.
