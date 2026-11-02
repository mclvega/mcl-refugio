import { describe, expect, it } from 'vitest';
import { cajaPieza, empujarDePieza, PIEZAS, puedeColocar, type Pieza } from '../src/core/construccion';
import { DIFICULTADES, DURACION_DIA, DURACION_NOCHE, escalaDia, MODOS } from '../src/core/difficulty';
import { PASO } from '../src/core/loop';
import { generarIsla, RADIO_ISLA, resolverChoquesIsla } from '../src/core/mundo';
import { alcanza, inventarioVacio, pagar, RECETAS } from '../src/core/objetos';
import { composicionOleada } from '../src/core/oleadas';
import { costeRecuerdo, recuerdosGanados, recuerdosVacios } from '../src/core/recuerdos';
import { crearRng } from '../src/core/rng';
import { controlesVacios, Partida, type Controles } from '../src/game/logica';
import { configPorDefecto, normalizarConfig } from '../src/settings';
import { anotarMuerte, guardadoNuevo, guardarAvance, limpiarNombre, normalizarAvance, normalizarGuardado } from '../src/storage';

const normal = MODOS.normal;
const nueva = (o: Partial<ConstructorParameters<typeof Partida>[0]> = {}) => new Partida({ semilla: 11, modo: normal, ...o });

function simular(p: Partida, segundos: number, c: Partial<Controles> = {}) {
  for (let t = 0; t < segundos && p.fase === 'juego'; t += PASO) p.actualizar(PASO, { ...controlesVacios(), ...c });
}

const pieza = (o: Partial<Pieza> = {}): Pieza => ({ id: 1, tipo: 'muro', x: 1, z: 1, giro: 0, vida: 160, ...o });

describe('dificultad', () => {
  it('cuatro modos y oleadas que crecen sin final', () => {
    expect(DIFICULTADES).toEqual(['muyFacil', 'facil', 'normal', 'desafio']);
    expect(MODOS.muyFacil.dano).toBeLessThan(MODOS.desafio.dano);
    expect(escalaDia(10).oleada).toBeGreaterThan(escalaDia(1).oleada);
    expect(escalaDia(5).jefe).toBe(true);
    expect(escalaDia(6).jefe).toBe(false);
  });

  it('la composición de la oleada trae tipos nuevos y el Gigante cada 5 noches', () => {
    const rng = crearRng(3);
    const n1 = composicionOleada(1, normal, rng.siguiente);
    expect(n1.every((t) => t === 'salvaje')).toBe(true);
    const n5 = composicionOleada(5, normal, rng.siguiente);
    expect(n5).toContain('gigante');
    expect(composicionOleada(8, MODOS.desafio, rng.siguiente).length).toBeGreaterThan(composicionOleada(8, MODOS.muyFacil, rng.siguiente).length);
  });
});

describe('isla', () => {
  it('es la misma con la misma semilla y deja libre el campamento', () => {
    const a = generarIsla(42);
    expect(generarIsla(42)).toEqual(a);
    expect(generarIsla(43)).not.toEqual(a);
    expect(a.nodos.filter((n) => n.tipo === 'arbol').length).toBeGreaterThan(150);
    expect(a.lagos.length).toBeGreaterThanOrEqual(2);
    for (const n of a.nodos) if (n.tipo !== 'arbusto' && Math.hypot(n.x, n.z) > 14) expect(Math.hypot(n.x, n.z)).toBeLessThan(RADIO_ISLA);
  });

  it('no deja salir de la isla ni meterse en el agua', () => {
    const isla = generarIsla(1);
    const c = { x: 500, z: 0 };
    resolverChoquesIsla(c, 0.4, isla);
    expect(Math.hypot(c.x, c.z)).toBeLessThan(RADIO_ISLA);
    const l = isla.lagos[0];
    const d = { x: l.x + 0.1, z: l.z };
    resolverChoquesIsla(d, 0.4, isla);
    expect(Math.hypot(d.x - l.x, d.z - l.z)).toBeGreaterThan(l.r - 0.1);
  });
});

describe('objetos y construcción', () => {
  it('las recetas cuestan lo que dicen', () => {
    const inv = inventarioVacio();
    const hacha = RECETAS.find((r) => r.id === 'hachaPiedra')!;
    expect(alcanza(inv, hacha.coste)).toBe(false);
    inv.palos = 2;
    inv.piedras = 2;
    inv.cuerda = 1;
    expect(pagar(inv, hacha.coste)).toBe(true);
    expect(inv.palos + inv.piedras + inv.cuerda).toBe(0);
  });

  it('una pieza por celda y los muros frenan', () => {
    const muro = pieza();
    expect(puedeColocar([muro], 1.5, 1.5)).toBe(false);
    expect(puedeColocar([muro], 3, 1)).toBe(true);
    expect(cajaPieza({ tipo: 'muro', giro: 1 })).toEqual({ mx: PIEZAS.muro.fondo / 2, mz: PIEZAS.muro.ancho / 2 });
    const c = { x: 1, z: 1.1 };
    expect(empujarDePieza(c, 0.4, muro, false)).toBe(true);
    expect(Math.abs(c.z - 1)).toBeGreaterThanOrEqual(0.25 + 0.4 - 1e-6);
    // La puerta deja pasar al jugador pero no a los enemigos.
    const puerta = pieza({ tipo: 'puerta' });
    expect(empujarDePieza({ x: 1, z: 1.1 }, 0.4, puerta, true)).toBe(false);
    expect(empujarDePieza({ x: 1, z: 1.1 }, 0.4, puerta, false)).toBe(true);
  });
});

describe('partida', () => {
  it('empieza de día con lo justo para un hacha', () => {
    const p = nueva();
    expect(p.esNoche).toBe(false);
    expect(p.armas).toEqual(['punos']);
    const hacha = RECETAS.find((r) => r.id === 'hachaPiedra')!;
    p.inv.piedras = 2;
    expect(p.fabricar(hacha)).toBe(true);
    expect(p.arma).toBe('hachaPiedra');
    expect(p.fabricar(hacha)).toBe(false);
  });

  it('el hambre y la sed bajan (salvo con la ayuda) y comer las sube', () => {
    const p = nueva();
    simular(p, 30);
    expect(p.jugador.hambre).toBeLessThan(100);
    expect(p.jugador.sed).toBeLessThan(p.jugador.hambre);
    const antes = p.jugador.hambre;
    expect(p.comer('bayas')).toBe(true);
    expect(p.jugador.hambre).toBeGreaterThan(antes);
    const sin = nueva({ hambreSed: false });
    simular(sin, 30);
    expect(sin.jugador.hambre).toBe(100);
  });

  it('talar un árbol da troncos y lo tumba', () => {
    const p = nueva();
    p.armas.push('hachaPiedra');
    p.arma = 'hachaPiedra';
    const arbol = p.isla.nodos.find((n) => n.tipo === 'arbol' && Math.hypot(n.x, n.z) > 9)!;
    p.jugador.x = arbol.x + arbol.r + 0.6;
    p.jugador.z = arbol.z;
    for (let i = 0; i < 6; i++) simular(p, 0.6, { atacar: true });
    expect(p.inv.troncos).toBeGreaterThan(3);
    expect(arbol.espera).toBeGreaterThan(0);
  });

  it('llega la noche con su oleada y amanece en el día siguiente', () => {
    const p = nueva({ modo: MODOS.muyFacil, hambreSed: false });
    p.tiempoDia = DURACION_DIA - 0.5;
    simular(p, 8);
    expect(p.esNoche).toBe(true);
    expect(p.enemigos.length).toBeGreaterThan(0);
    // Invulnerable para la prueba: solo interesa el paso del tiempo.
    p.jugador.vida = 1e9;
    p.jugador.vidaMax = 1e9;
    simular(p, DURACION_NOCHE);
    expect(p.dia).toBe(2);
    expect(p.esNoche).toBe(false);
    expect(p.enemigos.every((e) => e.huye || e.muerte >= 0)).toBe(true);
  });

  it('construir cuesta materiales y pone la pieza delante', () => {
    const p = nueva();
    p.inv.troncos = 10;
    p.empezarConstruir('muro');
    simular(p, PASO, { atacar: true });
    expect(p.piezas.length).toBe(1);
    expect(p.inv.troncos).toBe(7);
  });

  it('los enemigos golpean los muros que les cortan el paso', () => {
    const p = nueva();
    p.piezas.push(pieza({ x: 1, z: 7, giro: 0 }));
    p.enemigos.push({ id: 5000, tipo: 'salvaje', x: 1, z: 9, px: 1, pz: 9, yaw: 0, vida: 50, vidaMax: 50, velocidad: 3, dano: 10, recarga: 0, muerte: -1, huye: false, bloqueo: 0, golpeT: 0, moviendose: false });
    p.jugador.z = 2;
    simular(p, 3);
    expect(p.piezas[0].vida).toBeLessThan(160);
  });

  it('guarda y recupera el avance', () => {
    const p = nueva();
    p.inv.troncos = 7;
    p.piezas.push(pieza({ tipo: 'hoguera' }));
    const a = normalizarAvance(JSON.parse(JSON.stringify(p.avance())))!;
    const q = nueva({ avance: a });
    expect(q.inv.troncos).toBe(7);
    expect(q.piezas.length).toBe(1);
    expect(q.piezas[0].tipo).toBe('hoguera');
  });
});

describe('recuerdos, guardado y configuración', () => {
  it('costes y ganancias', () => {
    expect(costeRecuerdo(1)).toBeGreaterThan(costeRecuerdo(0));
    expect(recuerdosGanados(4, 1)).toBe(13);
    const r = recuerdosVacios();
    r.hacha = 1;
    expect(nueva({ recuerdos: r }).armas).toContain('hachaPiedra');
  });

  it('al morir queda el récord, se ganan recuerdos y se borra la partida', () => {
    const g = guardadoNuevo();
    guardarAvance(g, nueva().avance());
    expect(g.avance).not.toBeNull();
    const r = anotarMuerte(g, { dia: 6, abatidos: 12, jefes: 1 }, 'Ana');
    expect(r.record).toBe(true);
    expect(r.ganados).toBe(recuerdosGanados(5, 1));
    expect(g.avance).toBeNull();
    expect(g.estadisticas.diaMax).toBe(6);
  });

  it('normaliza datos dañados', () => {
    const g = normalizarGuardado({ nombre: 'Ana', puntos: -5, recuerdos: { vida: 99 }, avance: { inventario: { troncos: 500 }, piezas: [{ tipo: 'nave' }, { tipo: 'muro', x: 1, z: 1 }] }, config: { hambreSed: 'no' } });
    expect(g.nombre).toBe('Ana');
    expect(g.puntos).toBe(0);
    expect(g.recuerdos.vida).toBe(5);
    expect(g.avance!.inventario.troncos).toBe(99);
    expect(g.avance!.piezas).toHaveLength(1);
    expect(g.config.hambreSed).toBe(true);
    expect(normalizarConfig({ marcarEnemigos: false }).marcarEnemigos).toBe(false);
    expect(configPorDefecto().pantallaCompleta).toBe(true);
    expect(limpiarNombre('')).toBeNull();
  });
});
