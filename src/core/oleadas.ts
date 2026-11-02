import { escalaDia, type Modo } from './difficulty';

/** Enemigos y composición de las oleadas de cada noche. */

export type TipoEnemigo = 'salvaje' | 'hondero' | 'saltador' | 'rompedor' | 'gigante';

export interface DefEnemigo {
  nombre: string;
  vida: number;
  /** m/s. */
  velocidad: number;
  dano: number;
  /** Daño a las piezas de la base por golpe. */
  danoPieza: number;
  radio: number;
  /** Segundos entre golpes. */
  cadencia: number;
  /** Desde qué día aparece en las oleadas. */
  desde: number;
}

export const ENEMIGOS: Record<TipoEnemigo, DefEnemigo> = {
  salvaje: { nombre: 'Salvaje', vida: 50, velocidad: 3.6, dano: 10, danoPieza: 12, radio: 0.4, cadencia: 1, desde: 1 },
  hondero: { nombre: 'Hondero', vida: 35, velocidad: 3.2, dano: 8, danoPieza: 4, radio: 0.4, cadencia: 2.2, desde: 2 },
  saltador: { nombre: 'Saltador', vida: 30, velocidad: 5, dano: 7, danoPieza: 6, radio: 0.35, cadencia: 0.8, desde: 3 },
  rompedor: { nombre: 'Rompedor', vida: 110, velocidad: 2.6, dano: 18, danoPieza: 45, radio: 0.6, cadencia: 1.4, desde: 4 },
  gigante: { nombre: 'Gigante del bosque', vida: 650, velocidad: 2.3, dano: 32, danoPieza: 90, radio: 1.2, cadencia: 1.8, desde: 5 },
};

/** Distancia a la que el Hondero se para para lanzar piedras. */
export const DISTANCIA_HONDERO = 9;

/** Lista de enemigos de la oleada de una noche (sin orden de llegada). */
export function composicionOleada(dia: number, modo: Modo, azar: () => number): TipoEnemigo[] {
  const e = escalaDia(dia);
  const total = Math.max(2, Math.round(e.oleada * modo.oleada));
  const tipos = (Object.keys(ENEMIGOS) as TipoEnemigo[]).filter((t) => t !== 'gigante' && ENEMIGOS[t].desde <= dia);
  const pesos: Record<TipoEnemigo, number> = { salvaje: 5, hondero: 2, saltador: 2, rompedor: 1.2 + dia * 0.05, gigante: 0 };
  const suma = tipos.reduce((s, t) => s + pesos[t], 0);
  const lista: TipoEnemigo[] = [];
  for (let i = 0; i < total; i++) {
    let r = azar() * suma;
    let elegido = tipos[0];
    for (const t of tipos) {
      r -= pesos[t];
      if (r < 0) {
        elegido = t;
        break;
      }
    }
    lista.push(elegido);
  }
  if (e.jefe) lista.push('gigante');
  return lista;
}
