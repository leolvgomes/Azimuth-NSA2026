/**
 * Parâmetros do traje e da caminhada. Valores PLAUSÍVEIS para o demo
 * (rotulados "DADOS DE EXEMPLO" na tela). Alertas e ponto sem retorno saem daqui.
 */
export const suitConfig = {
  /** Faixa de temperatura de superfície que o traje aguenta (°C). */
  minSurfaceTempC: -80,
  maxSurfaceTempC: 30,
  /** Consumo de O₂ em % da carga total por hora de caminhada em terreno plano. */
  o2PctPerHour: 12,
  /** Consumo de bateria em % por hora. */
  batteryPctPerHour: 10,
  /** Velocidade de caminhada em terreno plano (km/h), traje + equipamento. */
  walkSpeedKmh: 3.0,
  /** Penalidade de velocidade por grau de inclinação (fração por grau). Tobler-like simplificado. */
  slowdownPerDeg: 0.03,
  /** Inclinação a partir da qual vira alerta / bloqueio (graus). */
  slopeWarnDeg: 15,
  slopeMaxDeg: 25,
  /** Margem de segurança sobre o O₂ da volta (0.3 = +30%). */
  returnSafetyMargin: 0.3,
  /** O₂ mínimo de reserva que nunca deve ser usado (%). */
  o2ReservePct: 10,
} as const;

/** Estado inicial dos sliders. */
export const initialSuitState = {
  o2Pct: 72,
  batteryPct: 64,
  suitTempC: 18,
} as const;

/** Constantes ambientais (painel, não camada). Fontes rotuladas na tela. */
export const environment = {
  /** MEDA (Perseverance): ar perto da superfície, valores típicos de exemplo. */
  airTempC: -23,
  pressurePa: 735,
  /** RAD (Curiosity): ~0,67 mSv/dia na superfície. Estimativa: Perseverance não tem dosímetro. */
  radiationMSvPerDay: 0.67,
} as const;
