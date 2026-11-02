import { crearRng } from './rng';

/** Isla boscosa generada con semilla: la misma semilla da siempre la misma isla. */

export const RADIO_ISLA = 78;
/** Claro del campamento inicial, sin árboles. */
export const RADIO_CLARO = 8;

export type TipoNodo = 'arbol' | 'roca' | 'arbusto' | 'caja';

export interface Nodo {
  id: number;
  tipo: TipoNodo;
  x: number;
  z: number;
  /** Radio de choque (0 = no choca). */
  r: number;
  vida: number;
  vidaMax: number;
  /** Segundos que faltan para que vuelva a estar disponible (0 = disponible). */
  espera: number;
  escala: number;
  giro: number;
}

export interface Lago {
  x: number;
  z: number;
  r: number;
}

export interface Suelto {
  id: number;
  tipo: 'palos' | 'piedras';
  x: number;
  z: number;
  espera: number;
}

export interface Isla {
  nodos: Nodo[];
  lagos: Lago[];
  sueltos: Suelto[];
}

/** Vida de cada nodo (golpes que aguanta) y tiempo de rebrote en segundos. */
export const NODOS: Record<TipoNodo, { vida: number; rebrote: number }> = {
  arbol: { vida: 4, rebrote: 150 },
  roca: { vida: 5, rebrote: 200 },
  arbusto: { vida: 1, rebrote: 70 },
  caja: { vida: 1, rebrote: 400 },
};

export const enIsla = (x: number, z: number, margen = 0) => Math.hypot(x, z) < RADIO_ISLA - margen;

export function generarIsla(semilla: number): Isla {
  const rng = crearRng(semilla);
  const lagos: Lago[] = [];
  for (let intento = 0; lagos.length < 3 && intento < 50; intento++) {
    const a = rng.rango(0, Math.PI * 2);
    const d = rng.rango(22, RADIO_ISLA - 18);
    const lago = { x: Math.cos(a) * d, z: Math.sin(a) * d, r: rng.rango(4, 7.5) };
    if (lagos.every((l) => Math.hypot(l.x - lago.x, l.z - lago.z) > l.r + lago.r + 10)) lagos.push(lago);
  }
  // Siempre hay un charco cerca del campamento para beber.
  lagos.unshift({ x: 13, z: -6, r: 3 });

  const nodos: Nodo[] = [];
  let id = 1;
  const libre = (x: number, z: number, r: number) =>
    enIsla(x, z, 6 + r) &&
    Math.hypot(x, z) > RADIO_CLARO + r &&
    lagos.every((l) => Math.hypot(l.x - x, l.z - z) > l.r + r + 0.8) &&
    nodos.every((n) => Math.hypot(n.x - x, n.z - z) > n.r + r + 0.9);
  const poner = (tipo: TipoNodo, cantidad: number, rMin: number, rMax: number, choca = true) => {
    for (let i = 0, intentos = 0; i < cantidad && intentos < cantidad * 15; intentos++) {
      const a = rng.rango(0, Math.PI * 2);
      const d = Math.sqrt(rng.siguiente()) * RADIO_ISLA;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const r = rng.rango(rMin, rMax);
      if (!libre(x, z, r)) continue;
      const v = NODOS[tipo].vida;
      nodos.push({ id: id++, tipo, x, z, r: choca ? r : 0, vida: v, vidaMax: v, espera: 0, escala: rng.rango(0.85, 1.25), giro: rng.rango(0, Math.PI * 2) });
      i++;
    }
  };
  poner('arbol', 260, 0.45, 0.6);
  poner('roca', 45, 0.8, 1.5);
  poner('arbusto', 70, 0.5, 0.7, false);
  poner('caja', 12, 0.45, 0.45);
  // Algunos árboles y rocas junto al campamento para empezar sin caminar mucho.
  for (const [x, z, tipo] of [[10, 4, 'arbol'], [-9, 6, 'arbol'], [-6, -10, 'arbol'], [3, 11, 'roca'], [-11, -3, 'arbusto']] as const) {
    const v = NODOS[tipo].vida;
    nodos.push({ id: id++, tipo, x, z, r: tipo === 'roca' ? 1 : tipo === 'arbol' ? 0.5 : 0, vida: v, vidaMax: v, espera: 0, escala: 1, giro: x });
  }

  const sueltos: Suelto[] = [];
  for (let i = 0; i < 90; i++) {
    const a = rng.rango(0, Math.PI * 2);
    const d = Math.sqrt(rng.siguiente()) * (RADIO_ISLA - 6);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (lagos.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 0.5)) continue;
    sueltos.push({ id: id++, tipo: rng.siguiente() < 0.6 ? 'palos' : 'piedras', x, z, espera: 0 });
  }
  return { nodos, lagos, sueltos };
}

/** ¿Hay agua para beber a menos de `alcance` del borde de algún lago? */
export const juntoAlAgua = (isla: Isla, x: number, z: number, alcance = 1.6) => isla.lagos.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + alcance);

/** Saca un círculo del agua, del borde de la isla y de los nodos que chocan. */
export function resolverChoquesIsla(c: { x: number; z: number }, r: number, isla: Isla): void {
  const d = Math.hypot(c.x, c.z);
  const max = RADIO_ISLA - 2 - r;
  if (d > max) {
    c.x = (c.x / d) * max;
    c.z = (c.z / d) * max;
  }
  for (const l of isla.lagos) {
    const dx = c.x - l.x;
    const dz = c.z - l.z;
    const dl = Math.hypot(dx, dz);
    const min = l.r + r - 0.4;
    if (dl < min && dl > 1e-4) {
      c.x = l.x + (dx / dl) * min;
      c.z = l.z + (dz / dl) * min;
    }
  }
  for (const n of isla.nodos) {
    if (!n.r || (n.tipo === 'arbol' && n.espera > 0)) continue;
    const dx = c.x - n.x;
    const dz = c.z - n.z;
    const min = n.r + r;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const dn = Math.hypot(dx, dz);
    if (dn >= min || dn < 1e-4) continue;
    c.x = n.x + (dx / dn) * min;
    c.z = n.z + (dz / dn) * min;
  }
}
