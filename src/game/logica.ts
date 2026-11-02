import { costeReparar, empujarDePieza, PIEZAS, puedeColocar, type IdPieza, type Pieza } from '../core/construccion';
import { DURACION_DIA, DURACION_NOCHE, escalaDia, type Modo } from '../core/difficulty';
import { enIsla, generarIsla, juntoAlAgua, NODOS, RADIO_ISLA, resolverChoquesIsla, type Isla, type Nodo } from '../core/mundo';
import {
  alcanza, ARMAS, COMIDAS, CURA_VENDA, DURACION_ANTORCHA, inventarioVacio, pagar, sumar, textoCoste,
  type IdArma, type IdRecurso, type Inventario, type Receta,
} from '../core/objetos';
import { composicionOleada, DISTANCIA_HONDERO, ENEMIGOS, type TipoEnemigo } from '../core/oleadas';
import { recuerdosVacios, type Recuerdos } from '../core/recuerdos';
import { crearRng, type Rng } from '../core/rng';

/** Una partida de supervivencia: lógica pura (sin three.js ni DOM), testeable. */

export interface Controles {
  /** Joystick: x a la derecha, z hacia atrás (arriba = -1). */
  x: number;
  z: number;
  giroX: number;
  giroY: number;
  atacar: boolean;
  esquivar: boolean;
  usar: boolean;
  cambiarArma: boolean;
  /** Modo construcción: girar la pieza y salir. */
  girar: boolean;
  cancelar: boolean;
}

export const controlesVacios = (): Controles => ({ x: 0, z: 0, giroX: 0, giroY: 0, atacar: false, esquivar: false, usar: false, cambiarArma: false, girar: false, cancelar: false });

export interface Resumen {
  /** Día alcanzado. */
  dia: number;
  abatidos: number;
  jefes: number;
  tiempo: number;
}

export interface Eventos {
  golpe?: (acierto: boolean) => void;
  recoger?: (r: IdRecurso) => void;
  dano?: () => void;
  abatido?: (t: TipoEnemigo) => void;
  construir?: (p: Pieza) => void;
  rota?: (p: Pieza) => void;
  disparo?: () => void;
  anochece?: () => void;
  amanece?: (dia: number) => void;
  guardar?: () => void;
  fallo?: (texto: string) => void;
  fin?: (r: Resumen) => void;
}

export interface Jugador {
  x: number;
  z: number;
  px: number;
  pz: number;
  yaw: number;
  vida: number;
  vidaMax: number;
  hambre: number;
  sed: number;
  energia: number;
  moviendose: boolean;
  /** Segundos hasta el siguiente golpe. */
  recarga: number;
  /** Animación del golpe: de 1 a 0. */
  golpeT: number;
  /** Segundos que quedan de esquiva (invulnerable). */
  esquiva: number;
  invulnerable: number;
  /** Segundos de antorcha encendida. */
  antorcha: number;
}

export interface Enemigo {
  id: number;
  tipo: TipoEnemigo;
  x: number;
  z: number;
  px: number;
  pz: number;
  yaw: number;
  vida: number;
  vidaMax: number;
  velocidad: number;
  dano: number;
  recarga: number;
  /** -1 si vive; segundos desde que cayó. */
  muerte: number;
  huye: boolean;
  /** Tiempo bloqueado por un muro (el Saltador salta al pasar 0,6 s). */
  bloqueo: number;
  golpeT: number;
  /** Para animar las piernas. */
  moviendose: boolean;
}

export type TipoAnimal = 'conejo' | 'ciervo';

export interface Animal {
  id: number;
  tipo: TipoAnimal;
  x: number;
  z: number;
  px: number;
  pz: number;
  yaw: number;
  vida: number;
  /** Dirección de paseo y tiempo hasta cambiarla. */
  dx: number;
  dz: number;
  cambio: number;
  huye: number;
  muerte: number;
}

export const ANIMALES: Record<TipoAnimal, { vida: number; velocidad: number; carne: number; hueso: number; radio: number }> = {
  conejo: { vida: 10, velocidad: 5.2, carne: 1, hueso: 1, radio: 0.3 },
  ciervo: { vida: 40, velocidad: 4.6, carne: 3, hueso: 2, radio: 0.6 },
};

export interface Proyectil {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
  tipo: 'flecha' | 'piedra';
  dano: number;
  /** Lo lanzó el jugador (o una torre). */
  amigo: boolean;
}

export interface Numero {
  x: number;
  z: number;
  valor: number;
  t: number;
  propio: boolean;
}

/** Estado que se guarda al amanecer y al descansar. */
export interface Avance {
  semilla: number;
  dia: number;
  x: number;
  z: number;
  vida: number;
  hambre: number;
  sed: number;
  inventario: Inventario;
  armas: IdArma[];
  arma: IdArma;
  piezas: Array<Omit<Pieza, 'id'>>;
  /** Nodos gastados: [id, vida, espera]. */
  agotados: Array<[number, number, number]>;
  abatidos: number;
  jefes: number;
}

export interface Opciones {
  semilla: number;
  modo: Modo;
  recuerdos?: Recuerdos;
  avance?: Avance | null;
  /** Ayuda: si es false, el hambre y la sed no bajan. */
  hambreSed?: boolean;
  eventos?: Eventos;
}

export const VELOCIDAD = 4.8;
export const RADIO_JUGADOR = 0.4;
export const ALCANCE_USAR = 2;
const DURACION_CICLO = DURACION_DIA + DURACION_NOCHE;

export class Partida {
  readonly semilla: number;
  readonly modo: Modo;
  readonly isla: Isla;
  readonly jugador: Jugador;
  readonly inv: Inventario;
  armas: IdArma[];
  arma: IdArma;
  piezas: Pieza[] = [];
  enemigos: Enemigo[] = [];
  animales: Animal[] = [];
  proyectiles: Proyectil[] = [];
  numeros: Numero[] = [];
  dia: number;
  /** Segundos dentro del ciclo: día de 0 a DURACION_DIA y noche hasta DURACION_CICLO. */
  tiempoDia = 0;
  tiempo = 0;
  fase: 'juego' | 'fin' = 'juego';
  pausada = false;
  camYaw = 0;
  camPitch = 0.38;
  mensaje = '';
  mensajeT = 0;
  abatidos: number;
  jefes: number;
  /** Pieza que se está colocando (modo construcción). */
  construyendo: IdPieza | null = null;
  fantasma = { x: 0, z: 0, giro: 0, valido: false };
  resumen: Resumen | null = null;
  hambreSed: boolean;
  private readonly rng: Rng;
  private readonly eventos: Eventos;
  private readonly recuerdos: Recuerdos;
  private pendientes: TipoEnemigo[] = [];
  private relojOleada = 0;
  private relojExplorador = 30;
  private relojAnimal = 0;
  private relojTorres = new Map<number, number>();
  private golpesTala = 0;
  private siguienteId = 1;

  constructor(o: Opciones) {
    this.semilla = o.semilla;
    this.modo = o.modo;
    this.eventos = o.eventos ?? {};
    this.recuerdos = o.recuerdos ?? recuerdosVacios();
    this.hambreSed = o.hambreSed ?? true;
    this.rng = crearRng((o.semilla ^ 0xa5a5a5a5) >>> 0);
    this.isla = generarIsla(o.semilla);
    const a = o.avance;
    const vidaMax = Math.round((100 + this.recuerdos.vida * 10) * o.modo.vida);
    this.jugador = {
      x: a?.x ?? 0, z: a?.z ?? 2, px: a?.x ?? 0, pz: a?.z ?? 2, yaw: Math.PI, vida: Math.min(vidaMax, a?.vida ?? vidaMax), vidaMax,
      hambre: a?.hambre ?? 100, sed: a?.sed ?? 100, energia: 100, moviendose: false, recarga: 0, golpeT: 0, esquiva: 0, invulnerable: 0, antorcha: 0,
    };
    this.inv = a ? { ...inventarioVacio(), ...a.inventario } : inventarioVacio();
    this.armas = a ? [...a.armas] : ['punos'];
    if (!this.armas.includes('punos')) this.armas.unshift('punos');
    if (!a) {
      const m = this.recuerdos.mochila;
      this.inv.palos = 2 + m * 4;
      this.inv.piedras = 1 + m * 3;
      this.inv.cuerda = 1 + m * 2;
      this.inv.bayas = 3;
      if (this.recuerdos.hacha) this.armas.push('hachaPiedra');
    }
    this.arma = a && this.armas.includes(a.arma) ? a.arma : this.armas[this.armas.length - 1];
    this.dia = a?.dia ?? 1;
    this.abatidos = a?.abatidos ?? 0;
    this.jefes = a?.jefes ?? 0;
    if (a) {
      for (const pz of a.piezas) this.piezas.push({ ...pz, id: this.siguienteId++ });
      const porId = new Map(this.isla.nodos.map((n) => [n.id, n]));
      for (const [id, vida, espera] of a.agotados) {
        const n = porId.get(id);
        if (n) {
          n.vida = vida;
          n.espera = espera;
        }
      }
    }
    this.siguienteId = Math.max(this.siguienteId, 100000);
    for (let i = 0; i < 10; i++) this.aparecerAnimal(true);
    this.avisar(a ? `Día ${this.dia}: sigues vivo` : 'Día 1: recoge palos y piedras y fabrica un hacha (🎒)');
  }

  get esNoche() {
    return this.tiempoDia >= DURACION_DIA;
  }

  /** Segundos hasta el cambio (anochecer o amanecer). */
  get faltaCambio() {
    return this.esNoche ? DURACION_CICLO - this.tiempoDia : DURACION_DIA - this.tiempoDia;
  }

  /** De 0 a 1 a lo largo del ciclo. */
  get hora() {
    return this.tiempoDia / DURACION_CICLO;
  }

  avisar(texto: string, segundos = 3) {
    this.mensaje = texto;
    this.mensajeT = segundos;
  }

  private fallo(texto: string) {
    this.avisar(texto, 2);
    this.eventos.fallo?.(texto);
  }

  /* ---------- Acciones desde la mochila ---------- */

  fabricar(r: Receta): boolean {
    if (r.arma && this.armas.includes(r.arma)) return false;
    if (!pagar(this.inv, r.coste)) return false;
    if (r.arma) {
      this.armas.push(r.arma);
      this.arma = r.arma;
    } else if (r.recurso) sumar(this.inv, r.recurso, r.cantidad ?? 1);
    return true;
  }

  comer(id: IdRecurso): boolean {
    const c = COMIDAS[id];
    if (!c || this.inv[id] <= 0) return false;
    const j = this.jugador;
    this.inv[id]--;
    j.hambre = Math.min(100, j.hambre + c.hambre);
    j.sed = Math.min(100, j.sed + c.sed);
    j.vida = Math.max(1, Math.min(j.vidaMax, j.vida + c.vida));
    return true;
  }

  vendar(): boolean {
    const j = this.jugador;
    if (this.inv.vendas <= 0 || j.vida >= j.vidaMax) return false;
    this.inv.vendas--;
    j.vida = Math.min(j.vidaMax, j.vida + CURA_VENDA);
    return true;
  }

  encenderAntorcha(): boolean {
    if (this.inv.antorchas <= 0) return false;
    this.inv.antorchas--;
    this.jugador.antorcha = DURACION_ANTORCHA;
    return true;
  }

  equipar(a: IdArma) {
    if (this.armas.includes(a)) this.arma = a;
  }

  empezarConstruir(tipo: IdPieza) {
    this.construyendo = tipo;
    this.actualizarFantasma();
  }

  /* ---------- Bucle ---------- */

  actualizar(dt: number, c: Controles) {
    if (this.fase !== 'juego' || this.pausada) return;
    this.tiempo += dt;
    this.mensajeT = Math.max(0, this.mensajeT - dt);
    for (const n of this.numeros) n.t += dt;
    this.numeros = this.numeros.filter((n) => n.t < 0.9);

    this.ciclo(dt);
    this.camYaw -= c.giroX;
    this.camPitch = Math.max(0.12, Math.min(1.1, this.camPitch + c.giroY));
    this.moverJugador(dt, c);
    this.supervivencia(dt);
    if (this.construyendo) this.modoConstruir(c);
    else {
      if (c.atacar) this.atacar();
      if (c.usar) this.usar();
    }
    if (c.cambiarArma) {
      const i = this.armas.indexOf(this.arma);
      this.arma = this.armas[(i + 1) % this.armas.length];
      this.avisar(`${ARMAS[this.arma].icono} ${ARMAS[this.arma].nombre}`, 1.2);
    }
    this.regenerar(dt);
    this.recogerSueltos();
    this.actualizarEnemigos(dt);
    this.actualizarAnimales(dt);
    this.actualizarTorres(dt);
    this.actualizarProyectiles(dt);

    if (this.jugador.vida <= 0) this.terminar();
  }

  private ciclo(dt: number) {
    const antes = this.tiempoDia;
    this.tiempoDia += dt;
    if (antes < DURACION_DIA - 20 && this.tiempoDia >= DURACION_DIA - 20) this.avisar('El sol se pone: la oleada llegará en 20 s');
    if (antes < DURACION_DIA && this.tiempoDia >= DURACION_DIA) {
      this.pendientes = composicionOleada(this.dia, this.modo, this.rng.siguiente);
      this.relojOleada = 2;
      this.avisar(escalaDia(this.dia).jefe ? '🌙 ¡Cae la noche y llega el Gigante del bosque!' : `🌙 Noche ${this.dia}: ¡defiende tu refugio!`);
      this.eventos.anochece?.();
    }
    if (this.tiempoDia >= DURACION_CICLO) {
      this.tiempoDia -= DURACION_CICLO;
      this.dia++;
      this.pendientes = [];
      for (const e of this.enemigos) e.huye = true;
      this.avisar(`☀️ Día ${this.dia}: sobreviviste a la noche`);
      this.eventos.amanece?.(this.dia);
    }
    if (this.esNoche && this.pendientes.length) {
      this.relojOleada -= dt;
      if (this.relojOleada <= 0) {
        this.relojOleada = Math.max(0.6, 2.6 - this.dia * 0.12);
        this.aparecerEnemigo(this.pendientes.shift()!);
      }
    }
    // De día, algún explorador desde el día 2.
    if (!this.esNoche && this.dia >= 2) {
      this.relojExplorador -= dt;
      const vivos = this.enemigos.filter((e) => e.muerte < 0 && !e.huye).length;
      if (this.relojExplorador <= 0 && vivos < Math.min(4, 1 + Math.floor(this.dia / 3))) {
        this.relojExplorador = 35;
        this.aparecerEnemigo('salvaje');
      }
    }
  }

  /** Dirección hacia delante de la cámara en el plano. */
  get adelante() {
    return { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
  }

  private moverJugador(dt: number, c: Controles) {
    const j = this.jugador;
    j.px = j.x;
    j.pz = j.z;
    j.recarga = Math.max(0, j.recarga - dt);
    j.golpeT = Math.max(0, j.golpeT - dt * 3.5);
    j.invulnerable = Math.max(0, j.invulnerable - dt);
    j.antorcha = Math.max(0, j.antorcha - dt);
    const f = this.adelante;
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let mx = f.x * -c.z + rx * c.x;
    let mz = f.z * -c.z + rz * c.x;
    const l = Math.hypot(mx, mz);
    j.moviendose = l > 0.1;
    if (c.esquivar && j.esquiva <= 0 && j.energia >= 25) {
      j.energia -= 25;
      j.esquiva = 0.28;
      if (!j.moviendose) {
        // Sin dirección se esquiva hacia atrás.
        mx = -Math.sin(j.yaw);
        mz = -Math.cos(j.yaw);
      }
    }
    j.energia = Math.min(100, j.energia + dt * 16);
    if (j.esquiva > 0) {
      j.esquiva -= dt;
      const ll = Math.hypot(mx, mz) || 1;
      j.x += (mx / ll) * 11 * dt;
      j.z += (mz / ll) * 11 * dt;
    } else if (j.moviendose) {
      const k = Math.min(1, l);
      j.x += (mx / l) * k * VELOCIDAD * dt;
      j.z += (mz / l) * k * VELOCIDAD * dt;
      if (j.golpeT <= 0) j.yaw = Math.atan2(mx, mz);
    }
    resolverChoquesIsla(j, RADIO_JUGADOR, this.isla);
    for (const p of this.piezas) empujarDePieza(j, RADIO_JUGADOR, p, true);
  }

  private supervivencia(dt: number) {
    const j = this.jugador;
    if (this.hambreSed) {
      const k = this.modo.hambre * (1 - this.recuerdos.estomago * 0.12);
      j.hambre = Math.max(0, j.hambre - dt * (100 / 330) * k);
      j.sed = Math.max(0, j.sed - dt * (100 / 250) * k);
    }
    if (j.hambre <= 0) j.vida -= dt * 1.5;
    if (j.sed <= 0) j.vida -= dt * 1.5;
    if (j.hambre > 50 && j.sed > 50) j.vida = Math.min(j.vidaMax, j.vida + dt * 1.2);
  }

  /* ---------- Golpes ---------- */

  private enemigoMasCercano(x: number, z: number, max: number, cono?: { x: number; z: number }): Enemigo | null {
    let mejor: Enemigo | null = null;
    let dm = max;
    for (const e of this.enemigos) {
      if (e.muerte >= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > dm + ENEMIGOS[e.tipo].radio) continue;
      if (cono && d > 0.01 && (dx * cono.x + dz * cono.z) / d < 0.55) continue;
      dm = d;
      mejor = e;
    }
    return mejor;
  }

  private atacar() {
    const j = this.jugador;
    const a = ARMAS[this.arma];
    if (j.recarga > 0 || j.esquiva > 0) return;
    j.recarga = a.cadencia;
    j.golpeT = 1;
    if (a.distancia) return this.disparar();
    // Se encara al enemigo más cercano a su alcance (también vale para los animales).
    const e = this.enemigoMasCercano(j.x, j.z, a.alcance + 0.6);
    if (e) {
      j.yaw = Math.atan2(e.x - j.x, e.z - j.z);
      this.danarEnemigo(e, a.dano);
      this.eventos.golpe?.(true);
      return;
    }
    const an = this.animales.find((b) => b.muerte < 0 && Math.hypot(b.x - j.x, b.z - j.z) < a.alcance + ANIMALES[b.tipo].radio + 0.4);
    if (an) {
      j.yaw = Math.atan2(an.x - j.x, an.z - j.z);
      this.danarAnimal(an, a.dano);
      this.eventos.golpe?.(true);
      return;
    }
    // Nodos: talar árboles y picar rocas.
    const n = this.nodoCercano(['arbol', 'roca'], a.alcance + 0.3);
    if (n) {
      j.yaw = Math.atan2(n.x - j.x, n.z - j.z);
      this.golpearNodo(n);
      return;
    }
    this.eventos.golpe?.(false);
  }

  private disparar() {
    const j = this.jugador;
    if (this.inv.flechas <= 0) {
      this.fallo('No te quedan flechas: fabrícalas en la mochila');
      return;
    }
    this.inv.flechas--;
    const f = this.adelante;
    const e = this.enemigoMasCercano(j.x, j.z, ARMAS.arco.alcance, f);
    const an = e ? null : this.animales.find((b) => b.muerte < 0 && Math.hypot(b.x - j.x, b.z - j.z) < ARMAS.arco.alcance && (b.x - j.x) * f.x + (b.z - j.z) * f.z > 0);
    const blanco = e ?? an;
    const dx = blanco ? blanco.x - j.x : f.x;
    const dz = blanco ? blanco.z - j.z : f.z;
    const d = Math.hypot(dx, dz) || 1;
    j.yaw = Math.atan2(dx, dz);
    this.proyectiles.push({ x: j.x, y: 1.3, z: j.z, vx: (dx / d) * 30, vz: (dz / d) * 30, t: 0, tipo: 'flecha', dano: ARMAS.arco.dano, amigo: true });
    this.eventos.disparo?.();
  }

  private nodoCercano(tipos: Nodo['tipo'][], alcance: number): Nodo | null {
    const j = this.jugador;
    let mejor: Nodo | null = null;
    let dm = Infinity;
    for (const n of this.isla.nodos) {
      if (!tipos.includes(n.tipo) || n.espera > 0) continue;
      const d = Math.hypot(n.x - j.x, n.z - j.z) - n.r;
      if (d < alcance && d < dm) {
        dm = d;
        mejor = n;
      }
    }
    return mejor;
  }

  private dar(r: IdRecurso, n: number) {
    if (n <= 0) return;
    sumar(this.inv, r, n);
    this.eventos.recoger?.(r);
  }

  /** Cantidad con el multiplicador de recursos (al menos 1). */
  private cantidad(base: number) {
    const v = base * this.modo.recursos;
    return Math.max(1, Math.floor(v) + (this.rng.siguiente() < v % 1 ? 1 : 0));
  }

  private golpearNodo(n: Nodo) {
    const a = ARMAS[this.arma];
    if (n.tipo === 'arbol') {
      if (!a.tala) {
        // A puñetazos solo caen palos.
        this.dar('palos', 1);
        this.eventos.golpe?.(true);
        return;
      }
      n.vida--;
      this.golpesTala++;
      const extra = this.recuerdos.carpintero && this.golpesTala % Math.max(1, 4 - this.recuerdos.carpintero) === 0 ? 1 : 0;
      this.dar('troncos', this.cantidad(a.tala) + extra);
      if (this.rng.siguiente() < 0.5) this.dar('palos', 1);
      if (n.vida <= 0) {
        n.espera = NODOS.arbol.rebrote;
        this.dar('troncos', this.cantidad(2));
        this.dar('palos', 2);
        this.avisar('¡Árbol talado!', 1.2);
      }
    } else {
      if (!a.mina) {
        this.fallo('Necesitas un hacha o un garrote para picar piedra');
        return;
      }
      n.vida--;
      this.dar('piedras', this.cantidad(a.mina));
      if (n.vida <= 0) n.espera = NODOS.roca.rebrote;
    }
    this.eventos.golpe?.(true);
  }

  private danarEnemigo(e: Enemigo, dano: number) {
    e.vida -= dano;
    this.numeros.push({ x: e.x, z: e.z, valor: Math.round(dano), t: 0, propio: false });
    if (e.vida <= 0 && e.muerte < 0) {
      e.muerte = 0;
      this.abatidos++;
      if (e.tipo === 'gigante') {
        this.jefes++;
        this.avisar('🏆 ¡Venciste al Gigante del bosque!');
        this.dar('chatarra', 5);
      }
      if (this.rng.siguiente() < 0.5) this.dar('hueso', 1);
      if (this.rng.siguiente() < 0.2) this.dar('chatarra', 1);
      this.eventos.abatido?.(e.tipo);
    }
  }

  private danarAnimal(an: Animal, dano: number) {
    an.vida -= dano;
    an.huye = 4;
    if (an.vida <= 0 && an.muerte < 0) {
      an.muerte = 0;
      const d = ANIMALES[an.tipo];
      this.dar('carne', this.cantidad(d.carne));
      this.dar('hueso', d.hueso);
    }
  }

  /* ---------- Usar ---------- */

  /** Qué hace «Usar» ahora mismo (para la ayuda del HUD). */
  accionUsar(): { texto: string; hacer: () => void } | null {
    const j = this.jugador;
    const arbusto = this.nodoCercano(['arbusto'], ALCANCE_USAR);
    if (arbusto) {
      return {
        texto: 'Recoger bayas y fibras',
        hacer: () => {
          arbusto.espera = NODOS.arbusto.rebrote;
          this.dar('bayas', this.cantidad(2));
          this.dar('cuerda', 1);
        },
      };
    }
    const caja = this.nodoCercano(['caja'], ALCANCE_USAR);
    if (caja) {
      return {
        texto: 'Abrir la caja',
        hacer: () => {
          caja.espera = NODOS.caja.rebrote;
          this.dar('chatarra', this.cantidad(2));
          this.dar('cuerda', 2);
          if (this.rng.siguiente() < 0.4) this.dar('vendas', 1);
        },
      };
    }
    const cerca = (tipo: IdPieza) => this.piezas.find((p) => p.tipo === tipo && Math.hypot(p.x - j.x, p.z - j.z) < 2.4);
    const hoguera = cerca('hoguera');
    if (hoguera && this.inv.carne > 0) {
      return {
        texto: `Asar ${this.inv.carne} de carne`,
        hacer: () => {
          this.dar('asada', this.inv.carne);
          this.inv.carne = 0;
        },
      };
    }
    if (juntoAlAgua(this.isla, j.x, j.z) && j.sed < 99) return { texto: 'Beber agua', hacer: () => (j.sed = 100) };
    const cama = cerca('cama');
    if (cama) {
      return {
        texto: this.esNoche && this.modo.dormirNoche ? 'Dormir hasta el amanecer' : 'Descansar y guardar',
        hacer: () => {
          j.vida = Math.max(j.vida, Math.min(j.vidaMax, j.vida + 25));
          if (this.esNoche && this.modo.dormirNoche) this.tiempoDia = DURACION_DIA + DURACION_NOCHE - 0.01;
          this.avisar('💾 Partida guardada');
          this.eventos.guardar?.();
        },
      };
    }
    const rota = this.piezas.filter((p) => p.vida < PIEZAS[p.tipo].vida && Math.hypot(p.x - j.x, p.z - j.z) < 2.6).sort((a, b) => a.vida - b.vida)[0];
    if (rota) {
      const coste = Math.min(costeReparar(rota), Math.max(1, this.inv.troncos));
      return {
        texto: `Reparar ${PIEZAS[rota.tipo].nombre.toLowerCase()} (🪵${coste})`,
        hacer: () => {
          if (this.inv.troncos < 1) return this.fallo('Necesitas troncos para reparar');
          this.inv.troncos -= coste;
          rota.vida = Math.min(PIEZAS[rota.tipo].vida, rota.vida + coste * 40);
        },
      };
    }
    return null;
  }

  private usar() {
    const a = this.accionUsar();
    if (a) a.hacer();
    else this.fallo('Aquí no hay nada que usar');
  }

  private recogerSueltos() {
    const j = this.jugador;
    for (const s of this.isla.sueltos) {
      if (s.espera > 0 || Math.abs(s.x - j.x) > 1.1 || Math.abs(s.z - j.z) > 1.1) continue;
      s.espera = 90;
      this.dar(s.tipo, 1);
    }
  }

  private regenerar(dt: number) {
    for (const n of this.isla.nodos) {
      if (n.espera <= 0) continue;
      n.espera -= dt;
      if (n.espera <= 0) {
        n.espera = 0;
        n.vida = n.vidaMax;
      }
    }
    for (const s of this.isla.sueltos) if (s.espera > 0) s.espera -= dt;
  }

  /* ---------- Construcción ---------- */

  private actualizarFantasma() {
    const j = this.jugador;
    const f = this.adelante;
    const x = Math.floor((j.x + f.x * 2.6) / 2) * 2 + 1;
    const z = Math.floor((j.z + f.z * 2.6) / 2) * 2 + 1;
    this.fantasma.x = x;
    this.fantasma.z = z;
    const tipo = this.construyendo!;
    const libreNodos = this.isla.nodos.every((n) => !n.r || (n.tipo === 'arbol' && n.espera > 0) || Math.hypot(n.x - x, n.z - z) > n.r + 1);
    const libreAgua = this.isla.lagos.every((l) => Math.hypot(l.x - x, l.z - z) > l.r + 1);
    const libreJugador = Math.hypot(j.x - x, j.z - z) > 1.2 || !PIEZAS[tipo].ancho || PIEZAS[tipo].puerta;
    this.fantasma.valido = enIsla(x, z, 3) && libreNodos && libreAgua && !!libreJugador && puedeColocar(this.piezas, x, z) && alcanza(this.inv, PIEZAS[tipo].coste);
  }

  private modoConstruir(c: Controles) {
    const tipo = this.construyendo!;
    if (c.cancelar) {
      this.construyendo = null;
      return;
    }
    if (c.girar) this.fantasma.giro = 1 - this.fantasma.giro;
    this.actualizarFantasma();
    if (!c.atacar) return;
    if (!alcanza(this.inv, PIEZAS[tipo].coste)) return this.fallo(`Te falta material: ${textoCoste(PIEZAS[tipo].coste)}`);
    if (!this.fantasma.valido) return this.fallo('Aquí no se puede construir');
    pagar(this.inv, PIEZAS[tipo].coste);
    const p: Pieza = { id: this.siguienteId++, tipo, x: this.fantasma.x, z: this.fantasma.z, giro: this.fantasma.giro, vida: PIEZAS[tipo].vida };
    this.piezas.push(p);
    this.eventos.construir?.(p);
    if (!alcanza(this.inv, PIEZAS[tipo].coste)) this.construyendo = null;
  }

  /* ---------- Enemigos ---------- */

  private aparecerEnemigo(tipo: TipoEnemigo) {
    const e = escalaDia(this.dia);
    const def = ENEMIGOS[tipo];
    for (let intento = 0; intento < 15; intento++) {
      const a = this.rng.rango(0, Math.PI * 2);
      const x = Math.cos(a) * (RADIO_ISLA - 4);
      const z = Math.sin(a) * (RADIO_ISLA - 4);
      if (this.isla.lagos.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 2)) continue;
      const vida = def.vida * e.vida;
      this.enemigos.push({
        id: this.siguienteId++, tipo, x, z, px: x, pz: z, yaw: 0, vida, vidaMax: vida, velocidad: def.velocidad * (1 + Math.min(0.25, this.dia * 0.01)),
        dano: def.dano * e.dano * this.modo.dano, recarga: 1, muerte: -1, huye: false, bloqueo: 0, golpeT: 0, moviendose: false,
      });
      return;
    }
  }

  /** Pieza más cercana (para los que rompen la base). */
  private piezaCercana(x: number, z: number, max: number): Pieza | null {
    let mejor: Pieza | null = null;
    let dm = max;
    for (const p of this.piezas) {
      if (p.tipo === 'trampa') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < dm) {
        dm = d;
        mejor = p;
      }
    }
    return mejor;
  }

  private danarPieza(p: Pieza, dano: number) {
    p.vida -= dano;
    if (p.vida <= 0) {
      this.piezas = this.piezas.filter((q) => q !== p);
      this.eventos.rota?.(p);
    }
  }

  private danarJugador(dano: number) {
    const j = this.jugador;
    if (j.esquiva > 0 || j.invulnerable > 0) return;
    j.vida = Math.max(0, j.vida - dano);
    j.invulnerable = 0.4;
    this.numeros.push({ x: j.x, z: j.z, valor: Math.round(dano), t: 0, propio: true });
    this.eventos.dano?.();
  }

  private actualizarEnemigos(dt: number) {
    const j = this.jugador;
    for (const e of this.enemigos) {
      e.px = e.x;
      e.pz = e.z;
      e.golpeT = Math.max(0, e.golpeT - dt * 3);
      if (e.muerte >= 0) {
        e.muerte += dt;
        continue;
      }
      const def = ENEMIGOS[e.tipo];
      e.recarga = Math.max(0, e.recarga - dt);
      // Objetivo: el jugador; los Rompedores y el Gigante van antes a por la base.
      let tx = j.x;
      let tz = j.z;
      let objetivoPieza: Pieza | null = null;
      if (e.huye) {
        const d = Math.hypot(e.x, e.z) || 1;
        tx = (e.x / d) * RADIO_ISLA;
        tz = (e.z / d) * RADIO_ISLA;
      } else if (e.tipo === 'rompedor' || e.tipo === 'gigante') {
        objetivoPieza = this.piezaCercana(e.x, e.z, 22);
        if (objetivoPieza && Math.hypot(j.x - e.x, j.z - e.z) > 5) {
          tx = objetivoPieza.x;
          tz = objetivoPieza.z;
        } else objetivoPieza = null;
      }
      const dx = tx - e.x;
      const dz = tz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      const dj = Math.hypot(j.x - e.x, j.z - e.z);
      const alcance = def.radio + RADIO_JUGADOR + 0.7;
      let avanzar = true;
      if (!e.huye && e.tipo === 'hondero' && dj < DISTANCIA_HONDERO) {
        avanzar = false;
        e.yaw = Math.atan2(j.x - e.x, j.z - e.z);
        if (e.recarga <= 0) {
          e.recarga = def.cadencia;
          e.golpeT = 1;
          const vx = (j.x - e.x) / dj;
          const vz = (j.z - e.z) / dj;
          this.proyectiles.push({ x: e.x, y: 1.4, z: e.z, vx: vx * 15, vz: vz * 15, t: 0, tipo: 'piedra', dano: e.dano, amigo: false });
        }
      } else if (!e.huye && !objetivoPieza && dj < alcance * 0.9) avanzar = false;
      e.moviendose = avanzar;
      if (avanzar) {
        e.x += (dx / d) * e.velocidad * dt;
        e.z += (dz / d) * e.velocidad * dt;
        e.yaw = Math.atan2(dx, dz);
      }
      resolverChoquesIsla(e, def.radio, this.isla);
      // Muros: si chocan, los golpean (el Saltador los salta).
      let bloqueado: Pieza | null = null;
      for (const p of this.piezas) {
        if (p.tipo === 'trampa') {
          if (Math.hypot(p.x - e.x, p.z - e.z) < 0.9 + def.radio && e.recarga <= 0.5) {
            this.danarEnemigo(e, 30);
            this.danarPieza(p, 30);
          }
          continue;
        }
        if (empujarDePieza(e, def.radio, p, false)) bloqueado = p;
      }
      if (objetivoPieza && Math.hypot(objetivoPieza.x - e.x, objetivoPieza.z - e.z) < def.radio + 1.6) bloqueado = objetivoPieza;
      if (bloqueado && !e.huye) {
        e.bloqueo += dt;
        if (e.tipo === 'saltador' && e.bloqueo > 0.6 && bloqueado.tipo !== 'torre') {
          // Salta al otro lado del muro.
          e.x += (dx / d) * 2.2;
          e.z += (dz / d) * 2.2;
          e.bloqueo = 0;
          if (bloqueado.tipo === 'pinchos') this.danarEnemigo(e, 12);
        } else if (e.recarga <= 0) {
          e.recarga = def.cadencia;
          e.golpeT = 1;
          this.danarPieza(bloqueado, def.danoPieza);
          if (bloqueado.tipo === 'pinchos') this.danarEnemigo(e, 10);
        }
      } else e.bloqueo = 0;
      // Golpe al jugador.
      if (!e.huye && e.tipo !== 'hondero' && dj < alcance && e.recarga <= 0) {
        e.recarga = def.cadencia;
        e.golpeT = 1;
        this.danarJugador(e.dano);
      }
      if (e.huye && Math.hypot(e.x, e.z) > RADIO_ISLA - 3.5) e.muerte = 0.5;
    }
    // Separación entre enemigos.
    const vivos = this.enemigos.filter((e) => e.muerte < 0);
    for (let a = 0; a < vivos.length; a++) {
      for (let b = a + 1; b < vivos.length; b++) {
        const p = vivos[a];
        const q = vivos[b];
        const min = ENEMIGOS[p.tipo].radio + ENEMIGOS[q.tipo].radio;
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d < 1e-4) continue;
        const k = (min - d) / 2;
        p.x -= (dx / d) * k;
        p.z -= (dz / d) * k;
        q.x += (dx / d) * k;
        q.z += (dz / d) * k;
      }
    }
    this.enemigos = this.enemigos.filter((e) => e.muerte < 1.2);
  }

  /* ---------- Animales ---------- */

  private aparecerAnimal(enCualquierSitio = false) {
    const j = this.jugador;
    for (let i = 0; i < 10; i++) {
      const a = this.rng.rango(0, Math.PI * 2);
      const d = enCualquierSitio ? this.rng.rango(15, RADIO_ISLA - 8) : this.rng.rango(30, RADIO_ISLA - 8);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!enCualquierSitio && Math.hypot(x - j.x, z - j.z) < 25) continue;
      if (this.isla.lagos.some((l) => Math.hypot(l.x - x, l.z - z) < l.r + 1)) continue;
      const tipo: TipoAnimal = this.rng.siguiente() < 0.6 ? 'conejo' : 'ciervo';
      this.animales.push({ id: this.siguienteId++, tipo, x, z, px: x, pz: z, yaw: 0, vida: ANIMALES[tipo].vida, dx: 0, dz: 0, cambio: 0, huye: 0, muerte: -1 });
      return;
    }
  }

  private actualizarAnimales(dt: number) {
    const j = this.jugador;
    this.relojAnimal -= dt;
    if (this.relojAnimal <= 0) {
      this.relojAnimal = 20;
      if (this.animales.filter((a) => a.muerte < 0).length < 10) this.aparecerAnimal();
    }
    for (const a of this.animales) {
      a.px = a.x;
      a.pz = a.z;
      if (a.muerte >= 0) {
        a.muerte += dt;
        continue;
      }
      const def = ANIMALES[a.tipo];
      const dj = Math.hypot(a.x - j.x, a.z - j.z);
      if (dj < 6) a.huye = Math.max(a.huye, 2);
      let v = 1.2;
      if (a.huye > 0) {
        a.huye -= dt;
        a.dx = (a.x - j.x) / (dj || 1);
        a.dz = (a.z - j.z) / (dj || 1);
        v = def.velocidad;
      } else {
        a.cambio -= dt;
        if (a.cambio <= 0) {
          a.cambio = this.rng.rango(2, 5);
          const ang = this.rng.rango(0, Math.PI * 2);
          const quieto = this.rng.siguiente() < 0.4;
          a.dx = quieto ? 0 : Math.cos(ang);
          a.dz = quieto ? 0 : Math.sin(ang);
        }
      }
      a.x += a.dx * v * dt;
      a.z += a.dz * v * dt;
      if (a.dx || a.dz) a.yaw = Math.atan2(a.dx, a.dz);
      resolverChoquesIsla(a, def.radio, this.isla);
      for (const p of this.piezas) empujarDePieza(a, def.radio, p, false);
    }
    this.animales = this.animales.filter((a) => a.muerte < 1);
  }

  /* ---------- Torres y proyectiles ---------- */

  private actualizarTorres(dt: number) {
    for (const p of this.piezas) {
      if (p.tipo !== 'torre') continue;
      const reloj = (this.relojTorres.get(p.id) ?? 0) - dt;
      this.relojTorres.set(p.id, reloj);
      if (reloj > 0 || this.inv.flechas <= 0) continue;
      const e = this.enemigoMasCercano(p.x, p.z, 15);
      if (!e) continue;
      this.relojTorres.set(p.id, 1.3);
      this.inv.flechas--;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      this.proyectiles.push({ x: p.x, y: 3.6, z: p.z, vx: (dx / d) * 28, vz: (dz / d) * 28, t: 0, tipo: 'flecha', dano: 20, amigo: true });
      this.eventos.disparo?.();
    }
  }

  private actualizarProyectiles(dt: number) {
    const j = this.jugador;
    for (const p of this.proyectiles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = Math.max(0.3, p.y - dt * (p.tipo === 'piedra' ? 0.8 : 0.5));
      if (p.amigo) {
        const e = this.enemigos.find((q) => q.muerte < 0 && Math.hypot(q.x - p.x, q.z - p.z) < ENEMIGOS[q.tipo].radio + 0.4);
        if (e) {
          this.danarEnemigo(e, p.dano);
          p.t = 99;
          continue;
        }
        const an = this.animales.find((q) => q.muerte < 0 && Math.hypot(q.x - p.x, q.z - p.z) < ANIMALES[q.tipo].radio + 0.4);
        if (an) {
          this.danarAnimal(an, p.dano);
          p.t = 99;
          continue;
        }
      } else {
        if (Math.hypot(j.x - p.x, j.z - p.z) < RADIO_JUGADOR + 0.3) {
          this.danarJugador(p.dano);
          p.t = 99;
          continue;
        }
        // Los muros paran las piedras.
        const muro = this.piezas.find((q) => PIEZAS[q.tipo].ancho && empujarDePieza({ x: p.x, z: p.z }, 0.15, q, false));
        if (muro) {
          this.danarPieza(muro, 3);
          p.t = 99;
          continue;
        }
      }
      // Los árboles paran todo.
      if (this.isla.nodos.some((n) => n.r && n.espera <= 0 && Math.abs(n.x - p.x) < n.r && Math.abs(n.z - p.z) < n.r)) p.t = 99;
    }
    this.proyectiles = this.proyectiles.filter((p) => p.t < 1.4);
  }

  /* ---------- Final y guardado ---------- */

  private terminar() {
    this.fase = 'fin';
    this.resumen = { dia: this.dia, abatidos: this.abatidos, jefes: this.jefes, tiempo: Math.floor(this.tiempo) };
    this.eventos.fin?.(this.resumen);
  }

  /** Estado para guardar (se llama al amanecer y al descansar). */
  avance(): Avance {
    const j = this.jugador;
    return {
      semilla: this.semilla,
      dia: this.dia,
      x: j.x,
      z: j.z,
      vida: Math.ceil(j.vida),
      hambre: Math.round(j.hambre),
      sed: Math.round(j.sed),
      inventario: { ...this.inv },
      armas: [...this.armas],
      arma: this.arma,
      piezas: this.piezas.map(({ tipo, x, z, giro, vida }) => ({ tipo, x, z, giro, vida })),
      agotados: this.isla.nodos.filter((n) => n.espera > 0 || n.vida < n.vidaMax).map((n) => [n.id, n.vida, Math.ceil(n.espera)]),
      abatidos: this.abatidos,
      jefes: this.jefes,
    };
  }

  /** Distancia del jugador a un punto. */
  distancia(x: number, z: number) {
    return Math.hypot(this.jugador.x - x, this.jugador.z - z);
  }
}
