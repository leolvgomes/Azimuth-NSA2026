# Azimuth: Interplanetary Guide

NASA Space Apps 2026, desafio **Interplanetary Survival Guide: Martian Map**. Site (não app) com um mapa
em camadas da Cratera Jezero que mostra ao astronauta a rota mais segura e sempre o caminho de volta.
Tagline: "Know the way home." Prazo: domingo 15/11/2026 à noite.

Time: Leonardo (código), Clara Almeida (design, briefing, vídeo), Paiva (a definir).

## Regras do repositório
- **Nunca commitar nem dar push.** O Leonardo revisa o código antes de qualquer commit.
- Nunca pedir a chave de API. Ela fica em `.env.local` (`GEMINI_API_KEY`), lida só no servidor.
- Nome, textos, cores e fontes: **só** em `src/config/brand.ts`. Parâmetros do traje: `src/config/suit.ts`.
  Geografia: `src/config/mission.ts`. Nada disso hardcoded em componentes.
- Todo número simulado aparece com o rótulo `DADOS DE EXEMPLO`. Radiação = estimativa do Curiosity RAD.
  Temperatura THEMIS = aproximada (brilho térmico). Robôs de apoio = conceito.
- Créditos: NASA/JPL-Caltech, MRO CTX, MOLA, THEMIS, CRISM, USGS Astrogeology, MEDA, RAD.
- Não rodar `npm install` sem necessidade real; se precisar de pacote novo, reportar ao orquestrador.

## Stack
Next.js 15 (App Router, `src/`), React 19, TypeScript, Tailwind 4, Leaflet/react-leaflet (mapa 2D,
`L.CRS.EPSG4326` = graus de Marte direto), Three.js/@react-three/fiber/drei (globo 3D), zustand (estado),
@google/genai (Gemini, function calling), vitest (testes), tsx + sharp + geotiff (scripts de dados).

## Arquitetura e donos (sistema de agentes)
| Pasta | Dono | O quê |
|---|---|---|
| `src/core/types.ts`, `src/ai/contract.ts`, `src/data/loadMapData.ts`, `src/config/**`, `CLAUDE.md` | orquestrador | contratos compartilhados |
| `scripts/data/**`, `public/data/**`, `public/tiles/**` | map-data | dados NASA processados |
| `src/core/**` (menos types.ts), `tests/core/**` | route-engine | A*, rotas, O₂, ponto sem retorno, alertas, dossiê |
| `src/app/**` (menos `api/`), `src/components/**` (menos `globe/`), `src/state/**`, `src/lib/**` | ui-builder | telas e estado |
| `src/components/globe/**`, `public/textures/**` | globe-3d | abertura de Marte em 3D |
| `src/app/api/azimuth/**`, `src/ai/**` (menos contract.ts) | ai-assistant | Gemini + plano B |

Fluxo: **dados → core (calcula) → UI (mostra) ⇄ IA (pede cálculo ao core e explica)**.
A IA nunca calcula números: chama funções de `src/core` e devolve `AzimuthResponse` (texto + ações).

## Dados-chave
- CTX Jezero: `data/raw/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif` (fora do git), 5322×5040,
  8 bits cinza, sem compressão, 6 m/px, nodata=0, bounds lat 18.2110–18.7212 N, lon 77.1605–77.6992 E.
- Base/abrigo: pouso do Perseverance 18.4447 N, 77.4508 E. Destino do demo: frente do delta.
- Design: Figma `7EbvATxAm9401jD8QUKB5X` (páginas Fluxograma, Design System, Telas). Fonte HTML das
  telas em `docs/design/*.html` (referência visual exata para a UI).
- Briefing completo: `docs/briefing.md`.

## Comandos
`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · `npm run data:build`
