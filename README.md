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

## Onde mexer
- Nome, textos, cores, fontes: `src/config/brand.ts`
- Parâmetros do traje (O₂/h, velocidade, faixa térmica): `src/config/suit.ts`
- Coordenadas (base, delta, limites): `src/config/mission.ts`
- Design (Figma + HTML de referência): `docs/design/`

## Créditos
Imagens e dados: NASA/JPL-Caltech, MRO CTX, MOLA, THEMIS, CRISM, USGS Astrogeology, MEDA (Perseverance),
RAD (Curiosity). Dados do traje são simulados (**DADOS DE EXEMPLO**); radiação é estimativa a partir do
Curiosity RAD; temperatura de superfície é aproximada (brilho térmico THEMIS).

Time: Clara Almeida (design), Leonardo (código), Paiva.
