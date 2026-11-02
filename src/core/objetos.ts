/** Recursos, armas y recetas (lógica pura). */

export type IdRecurso = 'troncos' | 'palos' | 'piedras' | 'cuerda' | 'carne' | 'asada' | 'bayas' | 'hueso' | 'chatarra' | 'flechas' | 'vendas' | 'antorchas';

export const RECURSOS: Record<IdRecurso, { nombre: string; icono: string }> = {
  troncos: { nombre: 'Troncos', icono: '🪵' },
  palos: { nombre: 'Palos', icono: '🌿' },
  piedras: { nombre: 'Piedras', icono: '🪨' },
  cuerda: { nombre: 'Cuerda', icono: '🧵' },
  carne: { nombre: 'Carne cruda', icono: '🥩' },
  asada: { nombre: 'Carne asada', icono: '🍖' },
  bayas: { nombre: 'Bayas', icono: '🫐' },
  hueso: { nombre: 'Hueso', icono: '🦴' },
  chatarra: { nombre: 'Chatarra', icono: '⚙️' },
  flechas: { nombre: 'Flechas', icono: '➶' },
  vendas: { nombre: 'Vendas', icono: '🩹' },
  antorchas: { nombre: 'Antorchas', icono: '🔦' },
};

export const IDS_RECURSO = Object.keys(RECURSOS) as IdRecurso[];

export type Inventario = Record<IdRecurso, number>;

export const inventarioVacio = (): Inventario =>
  Object.fromEntries(IDS_RECURSO.map((k) => [k, 0])) as Inventario;

/** Tope de cada recurso en la mochila. */
export const TOPE_MOCHILA = 99;

export type IdArma = 'punos' | 'hachaPiedra' | 'lanza' | 'garrote' | 'hachaMejorada' | 'arco';

export interface DefArma {
  nombre: string;
  icono: string;
  dano: number;
  /** Alcance del golpe (o de la flecha, para el arco). */
  alcance: number;
  /** Segundos entre golpes. */
  cadencia: number;
  /** Troncos por golpe al talar (0 = no tala). */
  tala: number;
  /** Piedras por golpe en las rocas. */
  mina: number;
  /** Dispara flechas. */
  distancia?: boolean;
}

export const ARMAS: Record<IdArma, DefArma> = {
  punos: { nombre: 'Puños', icono: '✊', dano: 6, alcance: 1.5, cadencia: 0.45, tala: 0, mina: 0 },
  hachaPiedra: { nombre: 'Hacha de piedra', icono: '🪓', dano: 14, alcance: 1.9, cadencia: 0.55, tala: 1, mina: 1 },
  lanza: { nombre: 'Lanza', icono: '🔱', dano: 20, alcance: 2.6, cadencia: 0.6, tala: 0, mina: 0 },
  garrote: { nombre: 'Garrote de hueso', icono: '🦴', dano: 28, alcance: 2, cadencia: 0.8, tala: 0, mina: 1 },
  hachaMejorada: { nombre: 'Hacha mejorada', icono: '⚒️', dano: 24, alcance: 2, cadencia: 0.5, tala: 2, mina: 2 },
  arco: { nombre: 'Arco', icono: '🏹', dano: 26, alcance: 24, cadencia: 0.7, tala: 0, mina: 0, distancia: true },
};

export const IDS_ARMA = Object.keys(ARMAS) as IdArma[];

export type Coste = Partial<Record<IdRecurso, number>>;

export interface Receta {
  id: string;
  nombre: string;
  icono: string;
  coste: Coste;
  /** Arma que se obtiene, o recurso y cantidad. */
  arma?: IdArma;
  recurso?: IdRecurso;
  cantidad?: number;
  texto: string;
}

export const RECETAS: readonly Receta[] = [
  { id: 'hachaPiedra', nombre: 'Hacha de piedra', icono: '🪓', coste: { palos: 2, piedras: 2, cuerda: 1 }, arma: 'hachaPiedra', texto: 'Tala árboles y sirve de arma.' },
  { id: 'lanza', nombre: 'Lanza', icono: '🔱', coste: { palos: 4, cuerda: 1 }, arma: 'lanza', texto: 'Mucho alcance.' },
  { id: 'garrote', nombre: 'Garrote de hueso', icono: '🦴', coste: { palos: 2, hueso: 3, cuerda: 1 }, arma: 'garrote', texto: 'Lento pero muy fuerte.' },
  { id: 'hachaMejorada', nombre: 'Hacha mejorada', icono: '⚒️', coste: { palos: 2, chatarra: 3, cuerda: 2 }, arma: 'hachaMejorada', texto: 'Tala el doble y golpea fuerte.' },
  { id: 'arco', nombre: 'Arco', icono: '🏹', coste: { palos: 3, cuerda: 3 }, arma: 'arco', texto: 'Dispara flechas a distancia.' },
  { id: 'flechas', nombre: '5 flechas', icono: '➶', coste: { palos: 3, piedras: 1 }, recurso: 'flechas', cantidad: 5, texto: 'Para el arco y las torres.' },
  { id: 'vendas', nombre: 'Venda', icono: '🩹', coste: { cuerda: 2 }, recurso: 'vendas', cantidad: 1, texto: 'Cura 40 de vida.' },
  { id: 'antorchas', nombre: 'Antorcha', icono: '🔦', coste: { palos: 1, cuerda: 1 }, recurso: 'antorchas', cantidad: 1, texto: 'Ilumina a tu alrededor 90 s.' },
];

export const alcanza = (inv: Inventario, c: Coste) => (Object.keys(c) as IdRecurso[]).every((k) => inv[k] >= (c[k] ?? 0));

export function pagar(inv: Inventario, c: Coste): boolean {
  if (!alcanza(inv, c)) return false;
  for (const k of Object.keys(c) as IdRecurso[]) inv[k] -= c[k] ?? 0;
  return true;
}

export const sumar = (inv: Inventario, k: IdRecurso, n: number) => {
  inv[k] = Math.min(TOPE_MOCHILA, inv[k] + n);
};

export const textoCoste = (c: Coste) =>
  (Object.keys(c) as IdRecurso[]).filter((k) => (c[k] ?? 0) > 0).map((k) => `${RECURSOS[k].icono}${c[k]}`).join(' ');

/** Qué da comer cada cosa: hambre, sed y vida. */
export const COMIDAS: Partial<Record<IdRecurso, { hambre: number; sed: number; vida: number }>> = {
  asada: { hambre: 35, sed: 0, vida: 8 },
  bayas: { hambre: 10, sed: 6, vida: 2 },
  carne: { hambre: 15, sed: 0, vida: -8 },
};

export const CURA_VENDA = 40;
export const DURACION_ANTORCHA = 90;
