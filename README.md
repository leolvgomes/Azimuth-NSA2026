# Azimuth: Interplanetary Guide

> Know the way home.

Mapa em camadas da Cratera Jezero (Marte) que mostra ao astronauta a rota mais segura e sempre o
caminho de volta. NASA Space Apps Challenge 2026: *Interplanetary Survival Guide: Martian Map*.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
```

### Assistente Azimuth (Gemini)
1. Gere uma chave gratuita em https://aistudio.google.com/apikey
2. Abra o arquivo **`.env.local`** na raiz do projeto
3. Cole a chave na linha **`GEMINI_API_KEY=`**, logo depois do `=` (sem aspas)
4. Reinicie o `npm run dev`

Sem chave, a Azimuth funciona no **plano B** (respostas pré-escritas usando os cálculos reais do site).
`AZIMUTH_OFFLINE=true` força o plano B (bom para gravar o vídeo sem depender de rede).

Proteções do link público: corpo da requisição limitado (512 KB) e **12 perguntas por minuto por IP**;
passou disso, a pessoa continua sendo atendida pelo plano B (a cota do Gemini fica preservada).
Se o Gemini demorar (> 12 s) ou falhar, o plano B responde na hora.

Na Vercel: Project → Settings → Environment Variables → `GEMINI_API_KEY` (e opcionalmente `GEMINI_MODEL`).

## Dados
Os dados processados já estão em `public/data`. Para regenerar a partir dos originais:
1. Coloque o mosaico CTX em `data/raw/` (link no `docs/briefing.md`; pasta fora do git)
2. `npm run data:build`

## Scripts
| Comando | O quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm test` | testes (lógica de rota, O₂, resgate, IA offline) |
| `npm run typecheck` | checagem de tipos |
| `npm run data:build` | regenera os dados NASA em `public/data` |

## O que tem no site
- **Abertura 3D**: Marte interativo (arrastar gira, roda/pinça dá zoom, duplo clique recentraliza em Jezero).
- **Sobre**: o que é, por que fizemos (Space Apps 2026), os 8 tipos de dado da NASA, como funciona e o time.
- **Tutorial interativo** (15 passos) que roda no app de verdade: cada passo espera o usuário fazer a ação.
  Na primeira visita aparece um convite discreto; depois, pelo botão `?` / `▶ TUTORIAL` no topo.
- **Mapa** (Planejar → Caminhar → Resgate) com a Azimuth (texto, voz e perguntas rápidas clicáveis).
- **Responsivo**: em telas médias as colunas recolhem; no celular os painéis viram uma gaveta inferior.

## Onde mexer
- Nome, textos, cores, fontes: `src/config/brand.ts`
- Tela Sobre, time e textos do tutorial: `src/config/about.ts` (passos em `src/components/guide/tourSteps.ts`)
- Parâmetros do traje (O₂/h, velocidade, faixa térmica): `src/config/suit.ts`
- Coordenadas (base, delta, limites): `src/config/mission.ts`
- Design (Figma + HTML de referência): `docs/design/`

## Créditos
Imagens e dados: NASA/JPL-Caltech, MRO CTX, MOLA, THEMIS, CRISM, USGS Astrogeology, MEDA (Perseverance),
RAD (Curiosity). Dados do traje são simulados (**DADOS DE EXEMPLO**); radiação é estimativa a partir do
Curiosity RAD; temperatura de superfície é aproximada (brilho térmico THEMIS).

Time: Leonardo Gomes (líder do time, engenharia de software), João Pedro (engenharia de software),
Maria Clara (engenharia civil; conceito, design, documento e vídeo).
