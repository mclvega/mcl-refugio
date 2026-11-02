import { IDS_PIEZA, PIEZAS } from './core/construccion';
import { IDS_ARMA, IDS_RECURSO, inventarioVacio, TOPE_MOCHILA, type IdArma } from './core/objetos';
import { IDS_RECUERDO, RECUERDOS, recuerdosGanados, recuerdosVacios, type Recuerdos } from './core/recuerdos';
import type { Avance } from './game/logica';
import { DEFAULT_LOOK, LOOK_OPTIONS, type Look } from './game/look';
import { configPorDefecto, normalizarConfig, type Configuracion } from './settings';

/** Una partida terminada: días sobrevividos. */
export interface Record_ {
  nombre: string;
  dias: number;
  abatidos: number;
  fecha: string;
}

export interface Estadisticas {
  partidas: number;
  diaMax: number;
  abatidos: number;
  jefes: number;
  muertes: number;
}

const estadisticasNuevas = (): Estadisticas => ({ partidas: 0, diaMax: 0, abatidos: 0, jefes: 0, muertes: 0 });

export interface Guardado {
  v: 1;
  nombre: string | null;
  /** Partida en curso (se guarda al amanecer y al descansar); null si no hay. */
  avance: Avance | null;
  /** Recuerdos para gastar en mejoras permanentes. */
  puntos: number;
  recuerdos: Recuerdos;
  records: Record_[];
  estadisticas: Estadisticas;
  /** Apariencia del superviviente (mismo sistema de personajes que el Arcade). */
  look: Look;
  config: Configuracion;
}

export const CLAVE_GUARDADO = 'mcl-refugio:v1';
const MAX_RECORDS = 10;

export const lookPorDefecto = (): Look => ({ ...DEFAULT_LOOK, shirt: 0x6d8b3a, hat: 'none', bottomColor: 0x5d4037, facialHair: 'stubble', hairColor: 0x3e2723 });

export const guardadoNuevo = (): Guardado => ({
  v: 1, nombre: null, avance: null, puntos: 0, recuerdos: recuerdosVacios(), records: [], estadisticas: estadisticasNuevas(), look: lookPorDefecto(), config: configPorDefecto(),
});

/** Semilla nueva para una isla. */
export const semillaNueva = (ahora = Date.now()) => (Math.imul(ahora, 2654435761) >>> 0) || 1;

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const entero = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : porDefecto;
const decimal = (v: unknown, min: number, max: number, porDefecto: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : porDefecto;

function normalizarRecord(v: unknown): Record_ | null {
  if (!esObjeto(v) || typeof v.nombre !== 'string' || typeof v.fecha !== 'string') return null;
  return { nombre: v.nombre.slice(0, 20), dias: entero(v.dias, 1, 1e6, 1), abatidos: entero(v.abatidos, 0, 1e7, 0), fecha: v.fecha };
}

/** Orden de la tabla: más días y, a igualdad, más enemigos abatidos. */
const comparar = (a: Record_, b: Record_) => b.dias - a.dias || b.abatidos - a.abatidos;

function normalizarEstadisticas(v: unknown): Estadisticas {
  const e = estadisticasNuevas();
  if (!esObjeto(v)) return e;
  for (const k of Object.keys(e) as Array<keyof Estadisticas>) e[k] = entero(v[k], 0, 1e9, 0);
  return e;
}

export function normalizarRecuerdos(v: unknown): Recuerdos {
  const r = recuerdosVacios();
  if (!esObjeto(v)) return r;
  for (const id of IDS_RECUERDO) r[id] = entero(v[id], 0, RECUERDOS[id].max, 0);
  return r;
}

/** Valida la partida guardada: si algo esencial está dañado, se descarta. */
export function normalizarAvance(v: unknown): Avance | null {
  if (!esObjeto(v) || !esObjeto(v.inventario)) return null;
  const inv = inventarioVacio();
  for (const k of IDS_RECURSO) inv[k] = entero(v.inventario[k], 0, TOPE_MOCHILA, 0);
  const armas = (Array.isArray(v.armas) ? v.armas : []).filter((a): a is IdArma => IDS_ARMA.includes(a as IdArma));
  const piezas = (Array.isArray(v.piezas) ? v.piezas : [])
    .filter(esObjeto)
    .filter((p) => IDS_PIEZA.includes(p.tipo as never))
    .slice(0, 400)
    .map((p) => {
      const tipo = p.tipo as Avance['piezas'][number]['tipo'];
      return { tipo, x: decimal(p.x, -200, 200, 0), z: decimal(p.z, -200, 200, 0), giro: p.giro === 1 ? 1 : 0, vida: entero(p.vida, 1, PIEZAS[tipo].vida, PIEZAS[tipo].vida) };
    });
  const agotados = (Array.isArray(v.agotados) ? v.agotados : [])
    .filter((a): a is [number, number, number] => Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === 'number' && Number.isFinite(n)))
    .slice(0, 2000);
  return {
    semilla: entero(v.semilla, 1, 0xffffffff, 1),
    dia: entero(v.dia, 1, 1e6, 1),
    x: decimal(v.x, -200, 200, 0),
    z: decimal(v.z, -200, 200, 2),
    vida: entero(v.vida, 1, 1000, 100),
    hambre: entero(v.hambre, 0, 100, 100),
    sed: entero(v.sed, 0, 100, 100),
    inventario: inv,
    armas: armas.length ? armas : ['punos'],
    arma: IDS_ARMA.includes(v.arma as IdArma) ? (v.arma as IdArma) : 'punos',
    piezas,
    agotados,
    abatidos: entero(v.abatidos, 0, 1e7, 0),
    jefes: entero(v.jefes, 0, 1e6, 0),
  };
}

/** Cada rasgo debe ser una de las opciones conocidas; si no, se usa el de por defecto. */
export function normalizarLook(entrada: unknown, porDefecto: Look): Look {
  if (!esObjeto(entrada)) return { ...porDefecto };
  const look = { ...porDefecto } as Record<string, unknown>;
  for (const [clave, opciones] of Object.entries(LOOK_OPTIONS)) {
    const valor = entrada[clave];
    const validos = (opciones as readonly unknown[]).map((o) => (typeof o === 'object' && o ? (o as { id: string }).id : o));
    if (validos.includes(valor)) look[clave] = valor;
  }
  return look as unknown as Look;
}

/** Valida datos guardados: cualquier campo dañado vuelve a su valor por defecto. */
export function normalizarGuardado(entrada: unknown): Guardado {
  const base = guardadoNuevo();
  if (!esObjeto(entrada)) return base;
  const records = Array.isArray(entrada.records)
    ? entrada.records.map(normalizarRecord).filter((r): r is Record_ => r !== null).sort(comparar).slice(0, MAX_RECORDS)
    : [];
  return {
    v: 1,
    nombre: typeof entrada.nombre === 'string' ? limpiarNombre(entrada.nombre) : null,
    avance: normalizarAvance(entrada.avance),
    puntos: entero(entrada.puntos, 0, 1e9, 0),
    recuerdos: normalizarRecuerdos(entrada.recuerdos),
    records,
    estadisticas: normalizarEstadisticas(entrada.estadisticas),
    look: normalizarLook(entrada.look, base.look),
    config: normalizarConfig(entrada.config),
  };
}

/** Guarda la partida en curso (al amanecer y al descansar). */
export function guardarAvance(g: Guardado, a: Avance): void {
  g.avance = a;
  g.estadisticas.diaMax = Math.max(g.estadisticas.diaMax, a.dia);
}

/**
 * Anota el final de una partida: queda en los récords, se ganan recuerdos y la partida se borra.
 * Devuelve los recuerdos ganados y si entra en la tabla.
 */
export function anotarMuerte(g: Guardado, r: { dia: number; abatidos: number; jefes: number }, nombre: string): { ganados: number; record: boolean } {
  const e = g.estadisticas;
  // Los abatidos de la partida se acumulan en ella y se suman a las estadísticas al terminar.
  e.abatidos += r.abatidos;
  e.jefes += r.jefes;
  e.muertes++;
  e.diaMax = Math.max(e.diaMax, r.dia);
  const ganados = recuerdosGanados(r.dia - 1, r.jefes);
  g.puntos += ganados;
  g.avance = null;
  const fila: Record_ = { nombre, dias: r.dia, abatidos: r.abatidos, fecha: new Date().toISOString().slice(0, 10) };
  g.records.push(fila);
  g.records.sort(comparar);
  g.records = g.records.slice(0, MAX_RECORDS);
  return { ganados, record: g.records.includes(fila) };
}

/** Nombre del jugador: 1 a 20 caracteres; letras, espacios, punto, apóstrofo y guion. */
export function limpiarNombre(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 20);
  return /^[\p{L}\p{M}\d .'-]{1,20}$/u.test(limpio) ? limpio : null;
}

function almacenSeguro(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function cargar(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Guardado {
  try {
    const texto = almacen?.getItem(CLAVE_GUARDADO);
    return texto ? normalizarGuardado(JSON.parse(texto)) : guardadoNuevo();
  } catch {
    return guardadoNuevo();
  }
}

export function guardar(g: Guardado, almacen: Pick<Storage, 'setItem'> | null = almacenSeguro()): void {
  try {
    almacen?.setItem(CLAVE_GUARDADO, JSON.stringify(g));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueado): el juego sigue en memoria.
  }
}
