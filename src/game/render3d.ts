import * as THREE from 'three';
import type { IdPieza } from '../core/construccion';
import { DURACION_DIA, DURACION_NOCHE } from '../core/difficulty';
import { RADIO_ISLA, type Nodo } from '../core/mundo';
import type { IdArma } from '../core/objetos';
import type { TipoEnemigo } from '../core/oleadas';
import { liberar } from '../rendimiento';
import { animateWalk, createAvatar, LOOK_OPTIONS, type Look } from './characters';
import type { Animal, Enemigo, Partida } from './logica';

/*
 * Dibujo de la isla con three.js: suelo, agua, árboles y rocas instanciados, piezas de la base,
 * personajes del Arcade para el jugador y los salvajes, y criaturas low-poly para el resto.
 * El sol gira con la hora; de noche solo alumbran dos PointLight fijas (hoguera y antorcha),
 * que siempre están en la escena para no recompilar los materiales.
 */

const cacheMat = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number) {
  let m = cacheMat.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    cacheMat.set(color, m);
  }
  return m;
}
const llamaMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const nucleoMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
const fantasmaBien = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false });
const fantasmaMal = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.45, depthWrite: false });

const malla = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sombra = true) => {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = sombra;
  me.receiveShadow = true;
  return me;
};

const G = {
  tronco: new THREE.CylinderGeometry(0.22, 0.32, 3, 7).translate(0, 1.5, 0),
  copa: new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 4.2, 0),
  copa2: new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 5.6, 0),
  roca: new THREE.DodecahedronGeometry(1, 0),
  arbusto: new THREE.IcosahedronGeometry(0.75, 0),
  baya: new THREE.SphereGeometry(0.1, 6, 4),
  caja: new THREE.BoxGeometry(0.9, 0.6, 0.6).translate(0, 0.3, 0),
  palo: new THREE.BoxGeometry(0.7, 0.07, 0.07),
  piedra: new THREE.DodecahedronGeometry(0.17, 0),
  tronquito: new THREE.CylinderGeometry(0.13, 0.13, 2.3, 6).translate(0, 1.15, 0),
  punta: new THREE.ConeGeometry(0.07, 0.45, 4),
  llama: new THREE.ConeGeometry(0.3, 0.9, 7).translate(0, 0.45, 0),
  flecha: new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4).rotateX(Math.PI / 2),
  piedraLanzada: new THREE.DodecahedronGeometry(0.14, 0),
};

const LEN = 0x8d6e4c;
const LEN_OSCURA = 0x6d4c32;

/** Modelo de cada pieza de la base, mirando a +z sin girar. */
function modeloPieza(tipo: IdPieza, m?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const M = (c: number) => m ?? mat(c);
  const troncosEnFila = (n: number, alto: number) => {
    for (let i = 0; i < n; i++) {
      const t = malla(G.tronquito, M(i % 2 ? LEN : LEN_OSCURA), -0.85 + (i * 1.7) / (n - 1), 0, 0);
      t.scale.y = alto / 2.3;
      g.add(t);
    }
  };
  switch (tipo) {
    case 'hoguera':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(malla(G.piedra, M(0x808080), Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55));
      }
      for (let i = 0; i < 3; i++) {
        const l = malla(G.palo, M(LEN_OSCURA), 0, 0.12, 0);
        l.rotation.y = (i / 3) * Math.PI;
        l.scale.set(1.2, 2.2, 2.2);
        g.add(l);
      }
      if (!m) {
        const llama = malla(G.llama, llamaMat, 0, 0.1, 0, false);
        llama.name = 'llama';
        g.add(llama, malla(new THREE.ConeGeometry(0.14, 0.5, 6).translate(0, 0.25, 0), nucleoMat, 0, 0.1, 0, false));
      }
      break;
    case 'cama': {
      // Refugio de ramas inclinado, con una cama de hojas.
      const techo = malla(new THREE.BoxGeometry(1.8, 0.08, 1.9), M(0x5d7a2e), 0, 0.85, -0.2);
      techo.rotation.x = -0.75;
      g.add(techo, malla(new THREE.BoxGeometry(1.4, 0.12, 1.2), M(0x7a9a3a), 0, 0.06, 0.25));
      for (const x of [-0.85, 0.85]) {
        const palo = malla(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5).translate(0, 0.95, 0), M(LEN_OSCURA), x, 0, 0.45);
        palo.rotation.x = -0.75;
        g.add(palo);
      }
      break;
    }
    case 'muro':
      troncosEnFila(6, 2.3);
      break;
    case 'puerta':
      for (const x of [-0.9, 0.9]) {
        const t = malla(G.tronquito, M(LEN_OSCURA), x, 0, 0);
        t.scale.y = 1.15;
        g.add(t);
      }
      g.add(malla(new THREE.BoxGeometry(2, 0.22, 0.25), M(LEN_OSCURA), 0, 2.55, 0));
      // Hoja de la puerta: tablas horizontales.
      for (let i = 0; i < 4; i++) g.add(malla(new THREE.BoxGeometry(1.5, 0.32, 0.12), M(i % 2 ? LEN : 0xa07a52), 0, 0.35 + i * 0.42, 0));
      break;
    case 'pinchos':
      troncosEnFila(6, 1.9);
      for (let i = 0; i < 5; i++) {
        for (const lado of [-1, 1]) {
          const p = malla(G.punta, M(0xc8b090), -0.8 + i * 0.4, 0.9 + (i % 2) * 0.5, lado * 0.35);
          p.rotation.x = lado * 1.25;
          g.add(p);
        }
      }
      break;
    case 'torre':
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const t = malla(G.tronquito, M(LEN_OSCURA), x, 0, z);
        t.scale.y = 1.45;
        g.add(t);
      }
      g.add(malla(new THREE.BoxGeometry(1.7, 0.18, 1.7), M(LEN), 0, 3.3, 0));
      for (const [x, z, w, d] of [[0, -0.8, 1.7, 0.1], [0, 0.8, 1.7, 0.1], [-0.8, 0, 0.1, 1.7], [0.8, 0, 0.1, 1.7]]) g.add(malla(new THREE.BoxGeometry(w, 0.5, d), M(0xa07a52), x, 3.65, z));
      break;
    case 'trampa':
      g.add(malla(new THREE.BoxGeometry(1.3, 0.06, 1.3), M(LEN_OSCURA), 0, 0.03, 0));
      for (let i = 0; i < 9; i++) {
        const p = malla(G.punta, M(0xc8b090), -0.4 + (i % 3) * 0.4, 0.2, -0.4 + Math.floor(i / 3) * 0.4);
        p.scale.setScalar(0.8);
        g.add(p);
      }
      break;
  }
  return g;
}

/** Arma en la mano (mirando hacia +z). */
function modeloArma(a: IdArma): THREE.Object3D {
  const g = new THREE.Group();
  const mango = (largo: number, color = LEN_OSCURA) => malla(new THREE.CylinderGeometry(0.03, 0.035, largo, 5).translate(0, largo / 2, 0), mat(color));
  switch (a) {
    case 'hachaPiedra':
    case 'hachaMejorada':
      g.add(mango(0.75), malla(new THREE.BoxGeometry(0.06, 0.18, 0.26), mat(a === 'hachaPiedra' ? 0x8a8a8a : 0xb0bec5), 0, 0.68, 0.1));
      break;
    case 'lanza':
      g.add(mango(1.6), malla(G.punta, mat(0x9e9e9e), 0, 1.7, 0));
      break;
    case 'garrote':
      g.add(mango(0.6, 0xe8dcc0), malla(new THREE.SphereGeometry(0.11, 6, 4), mat(0xe8dcc0), 0, 0.62, 0));
      break;
    case 'arco': {
      const arco = malla(new THREE.TorusGeometry(0.45, 0.025, 4, 12, Math.PI), mat(LEN_OSCURA));
      arco.rotation.z = Math.PI / 2;
      arco.position.y = 0.45;
      g.add(arco);
      break;
    }
    case 'punos':
      break;
  }
  return g;
}

/** Aspecto de los salvajes: piel y ropa de tonos tierra, con pintura de guerra. */
function lookSalvaje(id: number, tipo: TipoEnemigo): Look {
  const r = (n: number) => Math.abs(Math.sin(id * 12.9898 + n * 78.233)) % 1;
  const piel = LOOK_OPTIONS.skin[Math.floor(r(1) * LOOK_OPTIONS.skin.length)];
  const tierra = [0x5d4037, 0x6d4c41, 0x4e342e, 0x795548, 0x3e2723, 0x8d6e63];
  return {
    gender: r(2) < 0.7 ? 'boy' : 'girl',
    body: tipo === 'rompedor' ? 'strong' : tipo === 'hondero' ? 'slim' : r(3) < 0.5 ? 'normal' : 'strong',
    height: tipo === 'rompedor' ? 'tall' : 'medium',
    skin: piel,
    eyes: 'normal',
    facialHair: r(4) < 0.4 ? 'beard' : 'none',
    hair: (['mohawk', 'long', 'bald', 'curly'] as const)[Math.floor(r(5) * 4)],
    hairColor: 0x2b1b12,
    shirt: tierra[Math.floor(r(6) * tierra.length)],
    bottom: 'shorts',
    bottomColor: tierra[Math.floor(r(7) * tierra.length)],
    hat: 'none',
    hatColor: 0,
    accessory: 'none',
  };
}

interface ModeloPersona {
  grupo: THREE.Group;
  cuerpo: THREE.Group;
  /** Para criaturas sin `animateWalk`. */
  patas?: THREE.Object3D[];
}

function criatura(tipo: 'saltador' | 'gigante'): ModeloPersona {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group();
  grupo.add(cuerpo);
  const patas: THREE.Object3D[] = [];
  if (tipo === 'saltador') {
    const piel = mat(0x8a9a7a);
    const t = malla(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), piel, 0, 0.75, 0);
    t.rotation.x = 0.9;
    cuerpo.add(t, malla(new THREE.SphereGeometry(0.2, 7, 5), piel, 0, 1, 0.38));
    for (const x of [-0.08, 0.08]) cuerpo.add(malla(new THREE.SphereGeometry(0.04, 5, 4), mat(0xff3030), x, 1.04, 0.56, false));
    for (const x of [-0.2, 0.2]) {
      const p = new THREE.Group();
      p.position.set(x, 0.6, -0.1);
      p.add(malla(new THREE.BoxGeometry(0.1, 0.6, 0.1).translate(0, -0.3, 0), piel));
      patas.push(p);
      cuerpo.add(p);
    }
  } else {
    const piel = mat(0x5a6a4a);
    const piel2 = mat(0x3e4a32);
    cuerpo.add(malla(new THREE.DodecahedronGeometry(1.1, 0), piel, 0, 2.2, 0));
    cuerpo.add(malla(new THREE.DodecahedronGeometry(0.55, 0), piel2, 0, 3.4, 0.35));
    for (const x of [-0.25, 0.25]) cuerpo.add(malla(new THREE.SphereGeometry(0.09, 6, 4), mat(0xffd23f), x, 3.5, 0.82, false));
    for (const x of [-1.2, 1.2]) {
      const brazo = new THREE.Group();
      brazo.position.set(x, 2.8, 0);
      brazo.add(malla(new THREE.BoxGeometry(0.45, 1.9, 0.45).translate(0, -0.95, 0), piel2));
      patas.push(brazo);
      cuerpo.add(brazo);
    }
    for (const x of [-0.5, 0.5]) {
      const pierna = new THREE.Group();
      pierna.position.set(x, 1.3, 0);
      pierna.add(malla(new THREE.BoxGeometry(0.5, 1.3, 0.5).translate(0, -0.65, 0), piel));
      patas.push(pierna);
      cuerpo.add(pierna);
    }
  }
  return { grupo, cuerpo, patas };
}

function modeloAnimal(a: Animal): ModeloPersona {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group();
  grupo.add(cuerpo);
  const patas: THREE.Object3D[] = [];
  if (a.tipo === 'conejo') {
    const piel = mat(a.id % 2 ? 0xd7ccc8 : 0x8d6e63);
    cuerpo.add(malla(new THREE.SphereGeometry(0.22, 7, 5), piel, 0, 0.24, 0), malla(new THREE.SphereGeometry(0.14, 7, 5), piel, 0, 0.36, 0.2));
    for (const x of [-0.05, 0.05]) {
      const oreja = malla(new THREE.BoxGeometry(0.05, 0.22, 0.03), piel, x, 0.55, 0.18);
      oreja.rotation.x = -0.2;
      cuerpo.add(oreja);
    }
    cuerpo.add(malla(new THREE.SphereGeometry(0.07, 5, 4), mat(0xffffff), 0, 0.26, -0.22));
  } else {
    const piel = mat(0x8d5a3a);
    cuerpo.add(malla(new THREE.BoxGeometry(0.45, 0.45, 1.1), piel, 0, 0.95, 0));
    const cuello = malla(new THREE.BoxGeometry(0.22, 0.6, 0.22), piel, 0, 1.3, 0.5);
    cuello.rotation.x = 0.4;
    cuerpo.add(cuello, malla(new THREE.BoxGeometry(0.26, 0.24, 0.42), piel, 0, 1.6, 0.72));
    for (const x of [-0.12, 0.12]) {
      const asta = malla(new THREE.CylinderGeometry(0.02, 0.03, 0.45, 4), mat(0xd7c4a0), x, 1.88, 0.62);
      asta.rotation.z = x * 3;
      cuerpo.add(asta);
    }
    for (const [x, z] of [[-0.16, 0.4], [0.16, 0.4], [-0.16, -0.4], [0.16, -0.4]]) {
      const p = new THREE.Group();
      p.position.set(x, 0.75, z);
      p.add(malla(new THREE.BoxGeometry(0.09, 0.75, 0.09).translate(0, -0.375, 0), mat(0x6d4c32)));
      patas.push(p);
      cuerpo.add(p);
    }
  }
  return { grupo, cuerpo, patas };
}

export interface PuntoPantalla {
  x: number;
  y: number;
  visible: boolean;
}

export class Render3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly camara = new THREE.PerspectiveCamera(62, 1, 0.1, 260);
  private escena = new THREE.Scene();
  private sol: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private luzHoguera = new THREE.PointLight(0xffa050, 0, 16, 1.6);
  private luzAntorcha = new THREE.PointLight(0xffc070, 0, 12, 1.6);
  private cielo = new THREE.Color();
  private partida: Partida | null = null;
  private mundo = new THREE.Group();
  private instancias: Record<string, THREE.InstancedMesh> = {};
  private estadoNodos = '';
  private piezas3d = new Map<number, THREE.Group>();
  private fantasma: THREE.Group | null = null;
  private fantasmaClave = '';
  private enemigos3d = new Map<number, ModeloPersona>();
  private animales3d = new Map<number, ModeloPersona>();
  private flechas: THREE.InstancedMesh;
  private piedras: THREE.InstancedMesh;
  private jugador: ModeloPersona | null = null;
  private manoArma: THREE.Group | null = null;
  private armaActual: IdArma | null = null;
  private lookActual = '';
  private tamSombras = -1;
  private t = 0;
  private aux = new THREE.Object3D();
  private vec = new THREE.Vector3();
  private agua: THREE.Mesh;

  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x4a5a3a, 1.4);
    this.sol = new THREE.DirectionalLight(0xfff1d6, 1.8);
    Object.assign(this.sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
    this.escena.add(this.hemi, this.sol, this.sol.target, this.luzHoguera, this.luzAntorcha, this.mundo);
    this.escena.background = this.cielo;
    this.escena.fog = new THREE.Fog(0x000000, 45, 120);
    this.agua = malla(new THREE.CircleGeometry(400, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1e5a8a }), 0, -0.25, 0, false);
    this.escena.add(this.agua);
    this.flechas = new THREE.InstancedMesh(G.flecha, mat(0xd7c4a0), 80);
    this.piedras = new THREE.InstancedMesh(G.piedraLanzada, mat(0x777777), 60);
    this.flechas.frustumCulled = this.piedras.frustumCulled = false;
    this.escena.add(this.flechas, this.piedras);
  }

  ajustar(ancho: number, alto: number, ratio: number) {
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / Math.max(1, alto);
    this.camara.updateProjectionMatrix();
  }

  sombras(tam: number) {
    if (tam === this.tamSombras) return;
    this.tamSombras = tam;
    this.renderer.shadowMap.enabled = tam > 0;
    this.sol.castShadow = tam > 0;
    if (tam > 0) {
      this.sol.shadow.mapSize.set(tam, tam);
      this.sol.shadow.map?.dispose();
      this.sol.shadow.map = null;
    }
    this.escena.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  proyectar(x: number, y: number, z: number, ancho: number, alto: number): PuntoPantalla & { detras: boolean } {
    this.vec.set(x, y, z).project(this.camara);
    const detras = this.vec.z > 1;
    return { x: (this.vec.x * 0.5 + 0.5) * ancho, y: (-this.vec.y * 0.5 + 0.5) * alto, visible: !detras && Math.abs(this.vec.x) < 1.02 && Math.abs(this.vec.y) < 1.02, detras };
  }

  /* ---------- Isla ---------- */

  private montar(p: Partida) {
    this.partida = p;
    liberar(this.mundo);
    this.mundo.clear();
    for (const g of this.piezas3d.values()) this.escena.remove(g);
    this.piezas3d.clear();
    for (const m of [...this.enemigos3d.values(), ...this.animales3d.values()]) this.escena.remove(m.grupo);
    this.enemigos3d.clear();
    this.animales3d.clear();
    this.estadoNodos = '';

    const suelo = malla(new THREE.CircleGeometry(RADIO_ISLA, 72).rotateX(-Math.PI / 2), mat(0x4f7a32), 0, 0, 0, false);
    const playa = malla(new THREE.RingGeometry(RADIO_ISLA - 6, RADIO_ISLA + 3, 72).rotateX(-Math.PI / 2), mat(0xd8c08a), 0, 0.01, 0, false);
    const claro = malla(new THREE.CircleGeometry(7, 24).rotateX(-Math.PI / 2), mat(0x7a6a44), 0, 0.02, 0, false);
    this.mundo.add(suelo, playa, claro);
    for (const l of p.isla.lagos) {
      this.mundo.add(malla(new THREE.CircleGeometry(l.r + 0.8, 24).rotateX(-Math.PI / 2), mat(0x8a7a50), l.x, 0.03, l.z, false));
      this.mundo.add(malla(new THREE.CircleGeometry(l.r, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a7ab0 }), l.x, 0.05, l.z, false));
    }
    const contar = (t: Nodo['tipo']) => p.isla.nodos.filter((n) => n.tipo === t).length;
    const crear = (clave: string, geo: THREE.BufferGeometry, color: number, n: number) => {
      const im = new THREE.InstancedMesh(geo, mat(color), Math.max(1, n));
      im.castShadow = true;
      im.receiveShadow = true;
      this.instancias[clave] = im;
      this.mundo.add(im);
    };
    const arboles = contar('arbol');
    crear('tronco', G.tronco, 0x5d4030, arboles);
    crear('copa', G.copa, 0x2e6b30, arboles);
    crear('copa2', G.copa2, 0x3a8040, arboles);
    crear('roca', G.roca, 0x7a7a80, contar('roca'));
    crear('arbusto', G.arbusto, 0x3f7a2a, contar('arbusto'));
    crear('baya', G.baya, 0xc62848, contar('arbusto') * 4);
    crear('caja', G.caja, 0x7a5a3a, contar('caja'));
    crear('palo', G.palo, LEN_OSCURA, p.isla.sueltos.length);
    crear('piedra', G.piedra, 0x8a8a8a, p.isla.sueltos.length);
  }

  /** Pone al día árboles, rocas, arbustos, cajas y sueltos solo cuando algo cambia. */
  private actualizarNodos(p: Partida) {
    let clave = '';
    for (const n of p.isla.nodos) clave += n.espera > 0 ? '0' : '1';
    for (const s of p.isla.sueltos) clave += s.espera > 0 ? '0' : '1';
    if (clave === this.estadoNodos) return;
    this.estadoNodos = clave;
    const i: Record<string, number> = {};
    const poner = (k: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, giro: number) => {
      const im = this.instancias[k];
      const n = (i[k] = (i[k] ?? 0) + 1) - 1;
      this.aux.position.set(x, y, z);
      this.aux.rotation.set(0, giro, 0);
      this.aux.scale.set(sx, sy, sz);
      this.aux.updateMatrix();
      im.setMatrixAt(n, this.aux.matrix);
    };
    for (const n of p.isla.nodos) {
      const s = n.escala;
      const hay = n.espera <= 0;
      switch (n.tipo) {
        case 'arbol':
          // Talado: queda un tocón.
          poner('tronco', n.x, 0, n.z, s, hay ? s : 0.12, s, n.giro);
          poner('copa', n.x, 0, n.z, hay ? s : 0, hay ? s : 0, hay ? s : 0, n.giro);
          poner('copa2', n.x, 0, n.z, hay ? s : 0, hay ? s : 0, hay ? s : 0, n.giro);
          break;
        case 'roca': {
          const r = hay ? n.r : 0.3;
          poner('roca', n.x, r * 0.3, n.z, r, r * 0.75, r, n.giro);
          break;
        }
        case 'arbusto':
          poner('arbusto', n.x, 0.45 * s, n.z, s, s * 0.8, s, n.giro);
          for (let b = 0; b < 4; b++) {
            const a = n.giro + b * 1.6;
            const e = hay ? 1 : 0;
            poner('baya', n.x + Math.cos(a) * 0.55 * s, 0.55 * s + (b % 2) * 0.2, n.z + Math.sin(a) * 0.55 * s, e, e, e, 0);
          }
          break;
        case 'caja':
          poner('caja', n.x, 0, n.z, 1, hay ? 1 : 0.35, 1, n.giro);
          break;
      }
    }
    for (const s of p.isla.sueltos) {
      const e = s.espera > 0 ? 0 : 1;
      poner('palo', s.x, 0.04, s.z, s.tipo === 'palos' ? e : 0, e, e, s.id);
      poner('piedra', s.x, 0.08, s.z, s.tipo === 'piedras' ? e : 0, e, e, s.id);
    }
    for (const im of Object.values(this.instancias)) im.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Base ---------- */

  private actualizarPiezas(p: Partida, animaciones: boolean) {
    const vivas = new Set<number>();
    for (const pz of p.piezas) {
      vivas.add(pz.id);
      let g = this.piezas3d.get(pz.id);
      if (!g) {
        g = modeloPieza(pz.tipo);
        g.position.set(pz.x, 0, pz.z);
        g.rotation.y = pz.giro ? Math.PI / 2 : 0;
        this.piezas3d.set(pz.id, g);
        this.escena.add(g);
      }
      if (pz.tipo === 'hoguera') {
        const llama = g.getObjectByName('llama');
        if (llama) llama.scale.set(1, animaciones ? 1 + Math.sin(this.t * 14 + pz.id) * 0.15 : 1, 1);
      }
    }
    for (const [id, g] of this.piezas3d) {
      if (vivas.has(id)) continue;
      this.escena.remove(g);
      liberar(g);
      this.piezas3d.delete(id);
    }
    // Pieza fantasma al construir.
    const tipo = p.construyendo;
    const clave = tipo ? `${tipo}-${p.fantasma.valido}` : '';
    if (clave !== this.fantasmaClave) {
      this.fantasmaClave = clave;
      if (this.fantasma) {
        this.escena.remove(this.fantasma);
        liberar(this.fantasma);
        this.fantasma = null;
      }
      if (tipo) {
        this.fantasma = modeloPieza(tipo, p.fantasma.valido ? fantasmaBien : fantasmaMal);
        this.fantasma.traverse((o) => (o.castShadow = false));
        this.escena.add(this.fantasma);
      }
    }
    if (this.fantasma) {
      this.fantasma.position.set(p.fantasma.x, 0.02, p.fantasma.z);
      this.fantasma.rotation.y = p.fantasma.giro ? Math.PI / 2 : 0;
    }
  }

  /* ---------- Personajes ---------- */

  private montarJugador(look: Look, arma: IdArma) {
    const clave = JSON.stringify(look);
    if (!this.jugador || clave !== this.lookActual) {
      if (this.jugador) this.escena.remove(this.jugador.grupo);
      this.lookActual = clave;
      const av = createAvatar(look);
      this.jugador = { grupo: av.group, cuerpo: av.body };
      // El arma va en la mano derecha (el último brazo).
      const brazos = av.body.userData.arms as THREE.Group[];
      this.manoArma = new THREE.Group();
      this.manoArma.position.set(0, -0.38, 0.04);
      this.manoArma.rotation.x = Math.PI / 2;
      brazos[0].add(this.manoArma);
      this.armaActual = null;
      this.escena.add(av.group);
    }
    if (arma !== this.armaActual) {
      this.armaActual = arma;
      this.manoArma!.clear();
      this.manoArma!.add(modeloArma(arma));
    }
  }

  private modeloEnemigo(e: Enemigo): ModeloPersona {
    let m = this.enemigos3d.get(e.id);
    if (m) return m;
    if (e.tipo === 'saltador' || e.tipo === 'gigante') m = criatura(e.tipo);
    else {
      const av = createAvatar(lookSalvaje(e.id, e.tipo));
      // Pintura de guerra roja en la cara y un arma.
      for (const y of [1.3, 1.22]) av.body.add(malla(new THREE.BoxGeometry(0.3, 0.025, 0.02), mat(0xc62828), 0, y, 0.235, false));
      const brazos = av.body.userData.arms as THREE.Group[];
      const mano = new THREE.Group();
      mano.position.set(0, -0.38, 0.04);
      mano.rotation.x = Math.PI / 2;
      mano.add(modeloArma(e.tipo === 'rompedor' ? 'garrote' : e.tipo === 'hondero' ? 'punos' : 'lanza'));
      if (e.tipo === 'rompedor') mano.scale.setScalar(1.8);
      brazos[0].add(mano);
      m = { grupo: av.group, cuerpo: av.body };
    }
    this.enemigos3d.set(e.id, m);
    this.escena.add(m.grupo);
    return m;
  }

  private animarPatas(m: ModeloPersona, moviendose: boolean, velocidad = 10) {
    m.patas?.forEach((p, i) => (p.rotation.x = moviendose ? Math.sin(this.t * velocidad + i * Math.PI) * 0.6 : 0));
  }

  private dibujarEnemigos(p: Partida, alfa: number) {
    const vivos = new Set<number>();
    for (const e of p.enemigos) {
      vivos.add(e.id);
      const m = this.modeloEnemigo(e);
      m.grupo.position.set(e.px + (e.x - e.px) * alfa, 0, e.pz + (e.z - e.pz) * alfa);
      m.grupo.rotation.y = e.yaw;
      const muerto = e.muerte >= 0;
      if (muerto) {
        m.cuerpo.rotation.x = -Math.min(1, e.muerte * 3) * (Math.PI / 2);
        m.grupo.position.y = -Math.max(0, e.muerte - 0.6) * 1.5;
      } else if (m.patas) {
        this.animarPatas(m, e.moviendose, e.tipo === 'saltador' ? 16 : 6);
        m.cuerpo.rotation.x = e.golpeT * 0.4;
        if (e.tipo === 'saltador') m.cuerpo.position.y = e.moviendose ? Math.abs(Math.sin(this.t * 8)) * 0.3 : 0;
      } else {
        animateWalk(m.cuerpo, this.t + e.id, e.moviendose);
        const brazos = m.cuerpo.userData.arms as THREE.Object3D[];
        if (e.golpeT > 0) brazos[0].rotation.x = -2.2 * e.golpeT;
      }
      if (e.tipo === 'gigante') m.grupo.scale.setScalar(1);
    }
    for (const [id, m] of this.enemigos3d) {
      if (vivos.has(id)) continue;
      this.escena.remove(m.grupo);
      if (m.patas) liberar(m.grupo);
      this.enemigos3d.delete(id);
    }
  }

  private dibujarAnimales(p: Partida, alfa: number) {
    const vivos = new Set<number>();
    for (const a of p.animales) {
      vivos.add(a.id);
      let m = this.animales3d.get(a.id);
      if (!m) {
        m = modeloAnimal(a);
        this.animales3d.set(a.id, m);
        this.escena.add(m.grupo);
      }
      m.grupo.position.set(a.px + (a.x - a.px) * alfa, 0, a.pz + (a.z - a.pz) * alfa);
      m.grupo.rotation.y = a.yaw;
      const mueve = (a.dx !== 0 || a.dz !== 0) && a.muerte < 0;
      if (a.tipo === 'conejo') m.cuerpo.position.y = mueve ? Math.abs(Math.sin(this.t * (a.huye > 0 ? 14 : 7))) * 0.25 : 0;
      else this.animarPatas(m, mueve, a.huye > 0 ? 14 : 7);
      m.cuerpo.rotation.z = a.muerte >= 0 ? Math.min(1, a.muerte * 3) * (Math.PI / 2) : 0;
    }
    for (const [id, m] of this.animales3d) {
      if (vivos.has(id)) continue;
      this.escena.remove(m.grupo);
      liberar(m.grupo);
      this.animales3d.delete(id);
    }
  }

  private dibujarProyectiles(p: Partida) {
    let f = 0;
    let s = 0;
    for (const pr of p.proyectiles) {
      this.aux.position.set(pr.x, pr.y, pr.z);
      this.aux.rotation.set(0, Math.atan2(pr.vx, pr.vz), 0);
      this.aux.scale.setScalar(1);
      this.aux.updateMatrix();
      if (pr.tipo === 'flecha' && f < 80) this.flechas.setMatrixAt(f++, this.aux.matrix);
      else if (pr.tipo === 'piedra' && s < 60) this.piedras.setMatrixAt(s++, this.aux.matrix);
    }
    this.flechas.count = f;
    this.piedras.count = s;
    this.flechas.instanceMatrix.needsUpdate = true;
    this.piedras.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Luz del día ---------- */

  /** 1 a pleno día, 0 en plena noche, con atardecer y amanecer suaves. */
  static luzDia(tiempoDia: number) {
    const atardecer = 25;
    if (tiempoDia < DURACION_DIA - atardecer) return Math.min(1, 0.35 + (tiempoDia / 20) * 0.65);
    if (tiempoDia < DURACION_DIA) return (DURACION_DIA - tiempoDia) / atardecer;
    const n = tiempoDia - DURACION_DIA;
    return n > DURACION_NOCHE - 15 ? ((n - (DURACION_NOCHE - 15)) / 15) * 0.35 : 0;
  }

  private iluminar(p: Partida, oscuro: boolean, jx: number, jz: number) {
    const luz = Render3D.luzDia(p.tiempoDia);
    const ang = (p.tiempoDia / DURACION_DIA) * Math.PI;
    // Sol (o luna) que se recoloca a saltos para que las sombras no tiemblen.
    const sx = Math.round(jx / 4) * 4;
    const sz = Math.round(jz / 4) * 4;
    this.sol.position.set(sx + Math.cos(ang) * 30, 40, sz + 12);
    this.sol.target.position.set(sx, 0, sz);
    this.sol.intensity = 0.25 + luz * 1.6;
    this.sol.color.setHex(luz > 0.4 ? 0xfff1d6 : luz > 0.05 ? 0xffb070 : 0x8fa8ff);
    this.hemi.intensity = 0.35 + luz * 1.1;
    const dia = new THREE.Color(0x8ecfff);
    const noche = new THREE.Color(0x0a1028);
    this.cielo.copy(oscuro ? new THREE.Color(0x000000) : noche.lerp(dia, luz));
    (this.escena.fog as THREE.Fog).color.copy(this.cielo);
    (this.escena.fog as THREE.Fog).far = 70 + luz * 60;
    (this.agua.material as THREE.MeshLambertMaterial).color.setHex(oscuro && luz < 0.3 ? 0x050a14 : 0x1e5a8a);

    // De noche: la hoguera más cercana y la antorcha.
    const noche2 = 1 - Math.min(1, luz * 2.5);
    const hoguera = p.piezas.filter((q) => q.tipo === 'hoguera').sort((a, b) => Math.hypot(a.x - jx, a.z - jz) - Math.hypot(b.x - jx, b.z - jz))[0];
    this.luzHoguera.intensity = hoguera ? (8 + Math.sin(this.t * 13) * 1.2) * Math.max(0.15, noche2) : 0;
    if (hoguera) this.luzHoguera.position.set(hoguera.x, 1.4, hoguera.z);
    const antorcha = p.jugador.antorcha > 0;
    this.luzAntorcha.intensity = antorcha ? 7 * Math.max(0.2, noche2) : 0;
    this.luzAntorcha.position.set(jx, 2, jz);
  }

  /* ---------- Dibujo ---------- */

  dibujar(p: Partida, look: Look, oscuro: boolean, animaciones: boolean, dt: number, alfa: number) {
    this.t += dt;
    if (p !== this.partida) this.montar(p);
    this.actualizarNodos(p);
    this.actualizarPiezas(p, animaciones);
    this.montarJugador(look, p.arma);
    const j = p.jugador;
    const jx = j.px + (j.x - j.px) * alfa;
    const jz = j.pz + (j.z - j.pz) * alfa;
    const mj = this.jugador!;
    mj.grupo.position.set(jx, 0, jz);
    mj.grupo.rotation.y = j.yaw;
    mj.grupo.visible = j.invulnerable <= 0 || Math.floor(this.t * 20) % 2 === 0;
    animateWalk(mj.cuerpo, this.t, j.moviendose);
    const brazos = mj.cuerpo.userData.arms as THREE.Object3D[];
    if (j.golpeT > 0) brazos[0].rotation.x = -2.4 * Math.sin(j.golpeT * Math.PI);
    if (j.esquiva > 0) mj.cuerpo.rotation.x = 0.5;
    else mj.cuerpo.rotation.x = 0;

    this.dibujarEnemigos(p, alfa);
    this.dibujarAnimales(p, alfa);
    this.dibujarProyectiles(p);
    this.iluminar(p, oscuro, jx, jz);

    // Cámara detrás del jugador.
    const dist = p.construyendo ? 8 : 6.2;
    const cp = Math.cos(p.camPitch);
    this.camara.position.set(jx + Math.sin(p.camYaw) * dist * cp, 1.4 + dist * Math.sin(p.camPitch), jz + Math.cos(p.camYaw) * dist * cp);
    this.camara.lookAt(jx, 1.5, jz);
    this.renderer.render(this.escena, this.camara);
  }
}
