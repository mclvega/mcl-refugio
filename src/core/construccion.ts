import type { Coste } from './objetos';

/** Piezas de la base sobre una rejilla de 2 m (lógica pura). */

export const CELDA = 2;

export type IdPieza = 'hoguera' | 'cama' | 'muro' | 'puerta' | 'pinchos' | 'torre' | 'trampa';

export interface DefPieza {
  nombre: string;
  icono: string;
  coste: Coste;
  vida: number;
  /** Medidas del choque (ancho en x y fondo en z sin girar). 0 = no choca. */
  ancho: number;
  fondo: number;
  /** El jugador pasa, los enemigos no. */
  puerta?: boolean;
  texto: string;
}

export const PIEZAS: Record<IdPieza, DefPieza> = {
  hoguera: { nombre: 'Hoguera', icono: '🔥', coste: { troncos: 2, piedras: 4 }, vida: 80, ancho: 1.2, fondo: 1.2, texto: 'Luz de noche y para asar la carne.' },
  cama: { nombre: 'Refugio', icono: '⛺', coste: { troncos: 4, palos: 6, cuerda: 2 }, vida: 120, ancho: 1.8, fondo: 1.8, texto: 'Guarda la partida y cura al descansar.' },
  muro: { nombre: 'Muro de troncos', icono: '🧱', coste: { troncos: 3 }, vida: 160, ancho: 2, fondo: 0.5, texto: 'Frena a los enemigos.' },
  puerta: { nombre: 'Puerta', icono: '🚪', coste: { troncos: 3, cuerda: 1 }, vida: 140, ancho: 2, fondo: 0.5, puerta: true, texto: 'Tú pasas; los enemigos no.' },
  pinchos: { nombre: 'Muro con pinchos', icono: '🌵', coste: { troncos: 3, palos: 6 }, vida: 200, ancho: 2, fondo: 0.6, texto: 'Hiere a quien lo golpea.' },
  torre: { nombre: 'Torre de vigía', icono: '🗼', coste: { troncos: 6, cuerda: 3 }, vida: 220, ancho: 1.6, fondo: 1.6, texto: 'Dispara tus flechas a los enemigos cercanos.' },
  trampa: { nombre: 'Trampa de pinchos', icono: '⚠️', coste: { palos: 5, cuerda: 1 }, vida: 90, ancho: 0, fondo: 0, texto: 'Daña a los enemigos que la pisan (se gasta).' },
};

export const IDS_PIEZA = Object.keys(PIEZAS) as IdPieza[];

export interface Pieza {
  id: number;
  tipo: IdPieza;
  /** Centro de la celda. */
  x: number;
  z: number;
  /** 0 o 1: girada 90°. */
  giro: number;
  vida: number;
}

/** Centro de la celda de la rejilla que contiene el punto. */
export const ajustarRejilla = (v: number) => Math.floor(v / CELDA) * CELDA + CELDA / 2;

export const celdaDe = (x: number, z: number) => `${Math.floor(x / CELDA)},${Math.floor(z / CELDA)}`;

/** Medio ancho y medio fondo del choque de una pieza, ya girada. */
export function cajaPieza(p: Pick<Pieza, 'tipo' | 'giro'>): { mx: number; mz: number } {
  const d = PIEZAS[p.tipo];
  return p.giro ? { mx: d.fondo / 2, mz: d.ancho / 2 } : { mx: d.ancho / 2, mz: d.fondo / 2 };
}

/** ¿Se puede poner una pieza en esa celda? Una pieza por celda. */
export function puedeColocar(piezas: readonly Pieza[], x: number, z: number): boolean {
  const c = celdaDe(x, z);
  return !piezas.some((p) => celdaDe(p.x, p.z) === c);
}

/**
 * Saca un círculo de la caja de una pieza. Devuelve true si chocaba.
 * (Las trampas no chocan; las puertas solo frenan a los enemigos.)
 */
export function empujarDePieza(c: { x: number; z: number }, r: number, p: Pieza, esJugador: boolean): boolean {
  const d = PIEZAS[p.tipo];
  if (!d.ancho || (d.puerta && esJugador)) return false;
  const { mx, mz } = cajaPieza(p);
  const px = Math.max(p.x - mx, Math.min(p.x + mx, c.x));
  const pz = Math.max(p.z - mz, Math.min(p.z + mz, c.z));
  const dx = c.x - px;
  const dz = c.z - pz;
  const dist = Math.hypot(dx, dz);
  if (dist >= r) return false;
  if (dist < 1e-4) {
    // Dentro de la caja: se saca por el lado más cercano.
    const sx = mx - Math.abs(c.x - p.x);
    const sz = mz - Math.abs(c.z - p.z);
    if (sx < sz) c.x = p.x + Math.sign(c.x - p.x || 1) * (mx + r);
    else c.z = p.z + Math.sign(c.z - p.z || 1) * (mz + r);
    return true;
  }
  c.x = px + (dx / dist) * r;
  c.z = pz + (dz / dist) * r;
  return true;
}

/** Troncos para reparar una pieza del todo (1 tronco cada 40 de vida). */
export const costeReparar = (p: Pieza) => Math.ceil((PIEZAS[p.tipo].vida - p.vida) / 40);
