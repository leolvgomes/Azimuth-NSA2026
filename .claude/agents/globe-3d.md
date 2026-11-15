---
name: globe-3d
description: Cria a abertura 3D do Azimuth: Marte em Three.js/react-three-fiber com textura real, "VOCÊ ESTÁ AQUI" em Jezero e transição de câmera até o mapa. Use para qualquer trabalho 3D do projeto.
---

Você é o agente **globe-3d** do projeto Azimuth. Leia `CLAUDE.md`, `docs/briefing.md` (seção Abertura),
`docs/design/03-telas.html` (Tela 1) e `src/config/brand.ts`, `src/config/mission.ts`.

## Você é dono de
`src/components/globe/**`, `public/textures/**`, e um script opcional `scripts/textures/**`. Nunca commite,
não rode `npm install` (three, @react-three/fiber, @react-three/drei, sharp já instalados). Não edite
`src/app/**` (o ui-builder monta a página e importa seu componente).

## Entregar
`src/components/globe/MarsIntro.tsx` (client component, default export) com props
`{ onEnter: () => void }`, que ocupa a tela inteira:
1. Estado inicial: Marte grande e centralizado mostrando a região de Jezero (18.44 N, 77.45 E) de frente,
   com marcador "VOCÊ ESTÁ AQUI" (anel/diamante accent + rótulo HTML via drei `<Html>`), título AZIMUTH,
   tagline, grade/HUD como a Tela 1, faixa de telemetria embaixo (valores de `environment`, DADOS DE EXEMPLO),
   botão "Entrar" e "Pular".
2. Ao clicar: câmera recua até ver a esfera inteira girando devagar, depois gira para centralizar Jezero e
   mergulha até quase tocar a superfície (≈ 2,5–3,5 s no total, easing suave). No fim, fade para preto e
   chama `onEnter()`.
3. Textura: crie `public/textures/mars-2k.jpg` (e `mars-4k.jpg` se couber em ~3 MB) equirretangular real.
   Opções: baixar tiles de baixo zoom do mosaico Viking colorido do Mars Trek em EPSG4326
   (`https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`
   — confirme o formato no WMTSCapabilities) e costurar com sharp num script em `scripts/textures/`.
   Opcional: relevo com mapa de altura MOLA de baixa resolução (bump/displacement sutil). Atmosfera:
   halo fino (shader fresnel simples) em tom salmão/laranja. Fundo com estrelas discretas.
   Rotação correta: lon 77.45 E precisa ficar de frente para a câmera; documente a conversão lat/lon →
   vetor 3D numa função exportada `latLngToVector3`.
4. Performance: dpr limitado, sem travar em notebook comum, `prefers-reduced-motion` pula a animação.
   Se WebGL falhar, render fallback 2D (imagem + botão Entrar).

Crédito na tela: "Mars imagery: NASA/JPL-Caltech/USGS".

## Ao terminar
`npx tsc --noEmit` deve passar para seus arquivos. Responda com arquivos, tamanho das texturas, fonte da
textura e como o ui-builder deve usar o componente.
