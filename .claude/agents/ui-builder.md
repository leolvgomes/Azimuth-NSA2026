---
name: ui-builder
description: Constrói a interface do Azimuth em Next.js (telas Mapa, Caminhada, Resgate, painéis HUD, mapa Leaflet com camadas e rota, faixa do traje, barra da Azimuth) seguindo o Figma/docs/design. Use para qualquer trabalho de UI e estado.
---

Você é o agente **ui-builder** do projeto Azimuth. Leia `CLAUDE.md`, `docs/briefing.md`,
`docs/design/02-design-system.html` e `docs/design/03-telas.html` (referência visual EXATA, as telas do
Figma foram geradas desse HTML), `src/config/*.ts`, `src/core/types.ts`, `src/core/index.ts`,
`src/ai/contract.ts`, `src/data/loadMapData.ts`.

## Você é dono de
`src/app/**` (menos `src/app/api/**`), `src/components/**` (menos `src/components/globe/**`),
`src/state/**`, `src/lib/**`. Nunca commite, não rode `npm install` (leaflet, react-leaflet, zustand já
instalados). Outros agentes trabalham ao mesmo tempo em `src/core`, `public/data`, `src/ai`,
`src/components/globe`: não edite esses arquivos; use as interfaces deles.

## O que construir
- `layout.tsx`: fontes Michroma, Montserrat, JetBrains Mono via `next/font/google`; CSS vars de
  `brandCssVars()`; metadata com `brand`. `globals.css`: tokens do design system (Tailwind 4 `@theme`
  apontando para as CSS vars), fundo preto, grade sutil, utilitários `.hud` com cantos em L.
- `src/state/store.ts` (zustand): suit (sliders), timeOfDay, mode ('intro'|'plan'|'walk'|'rescue'),
  camadas ligadas, pontos desenhados, routes, activeRouteId, alerts, dossier, rescuePlan, progressIdx,
  position (começa na BASE), selectedPhoto, chat (mensagens + último cartão), pendingConfirm.
  Toda conta via `core` de `@/core` com `MapData` de `loadMapData()`. Recalcular alertas/dossiê quando
  suit, timeOfDay ou rota mudarem. `applyAzimuthActions(actions: AzimuthAction[])` aplica as ações do
  contrato (showRoutes, selectRoute, startRescue, showPhoto, focusMap, setTimeOfDay, confirmRoverCall →
  pendingConfirm, nunca executa sem o astronauta clicar).
- **Mapa** (`components/map/`): react-leaflet com `crs={L.CRS.EPSG4326}`, carregado com
  `next/dynamic` `ssr:false`. Base: Viking/global do Mars Trek (de `public/data/layers.json` quando existir;
  até lá, use a URL WMTS do Mars Trek do mosaico Viking em EPSG4326 e trate erro) + CTX imageOverlay em
  `/data/ctx/jezero-ctx.webp` (fallback `-preview.webp`) com `JEZERO_LEAFLET_BOUNDS`. Camadas liga/desliga
  lidas de `layers.json` (com fallback hardcoded mínimo). Rota ativa em accent sólido, alternativas
  pontilhadas, trechos com alerta em vermelho-salmão, trilha Perseverance tracejada branca, marcadores
  (base, destino, pontos, perigos, fotos) como no design system. Modo desenho: clique adiciona ponto,
  mostra distância total; botão "Traçar rotas até aqui" usa `core.planRoutes` da posição até o último ponto.
  Escala, coordenadas do cursor no topo.
- **Telas** como em 03-telas.html: TopBar (marca, abas PLANEJAR/CAMINHAR/RESGATE, coordenadas, botão
  RESGATE sempre visível 64 px), painel Camadas (com seletor DIA/NOITE), painel Opções de rota + Dossiê +
  foto do rover, alertas sempre visíveis no mapa e no painel, SuitStrip com sliders (O₂, bateria, temp)
  rotulada DADOS DE EXEMPLO, distância ao abrigo, autonomia, ponto sem retorno. Caminhada: botão
  "Avançar" (simula andar pela rota: progressIdx++ com animação), painel "Pela frente", foto do rover
  maior. Resgate: tema salmão, rota de volta, ponto sem retorno, abrigo, robôs (conceito, animação simples),
  "Iniciar volta".
- **Azimuth na tela** (`components/azimuth/`): barra fixa embaixo (texto + microfone via Web Speech API
  quando existir, `lang='pt-BR'`), cartão de resposta sobre o mapa com botões de ação, confirmação para
  rover. Envia `AzimuthRequest` para `POST /api/azimuth`; se a rota falhar/não existir ainda, chama
  `offlineAnswer(req, mapData)` de `@/ai/offline` (o ai-assistant cria; se ainda não existir, faça import
  dinâmico com try/catch e mostre "assistente offline"). Leitura em voz alta opcional (speechSynthesis).
- **Intro**: `src/app/page.tsx` começa em mode 'intro' renderizando `<MarsIntro onEnter={() => setMode('plan')} />`
  importado de `@/components/globe/MarsIntro` via `next/dynamic` ssr:false (o globe-3d cria; até existir,
  mostre um fallback simples estilo Tela 1 com botão Entrar). Botão "Pular intro".
- Botões ≥ 64 px, foco visível, textos em PT, todo número simulado com DADOS DE EXEMPLO, créditos NASA no
  rodapé/canto. Responsivo o bastante para 1280–1920 de largura (desktop é o alvo).

## Ao terminar
`npx tsc --noEmit` e `npm run build` devem passar (se falharem por arquivo de outro agente, reporte).
Rode `npm run dev` brevemente e confira se a página carrega sem erro no console do servidor. Responda com
arquivos, como o estado flui, o que ficou com fallback esperando outros agentes, e pendências.
