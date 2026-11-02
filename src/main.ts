import './styles.css';

import { app } from './app';
import { audio } from './audio';
import { PIEZAS } from './core/construccion';
import { escalaDia, MODOS } from './core/difficulty';
import { Entrada } from './core/input';
import { iniciarBucle } from './core/loop';
import { ARMAS, RECURSOS, textoCoste, type IdRecurso } from './core/objetos';
import { ENEMIGOS } from './core/oleadas';
import { iniciarPantallaCompleta } from './fullscreen';
import { controlesVacios, Partida, type Resumen } from './game/logica';
import type { Render3D } from './game/render3d';
import { Rendimiento, tamanoSombras } from './rendimiento';
import { anotarMuerte, guardarAvance, limpiarNombre, semillaNueva } from './storage';
import { panelConfiguracion } from './ui/configuracion';
import { boton, h, mostrarPanel } from './ui/dom';
import { pantallaConstruir, pantallaMochila } from './ui/mochila';
import { pantallaRecuerdos } from './ui/recuerdos';

const hud = document.getElementById('lienzo') as HTMLCanvasElement;
const ctx = hud.getContext('2d')!;
const lienzo3d = document.createElement('canvas');
lienzo3d.id = 'lienzo3d';
hud.before(lienzo3d);
const controles = document.getElementById('controles')!;
// Teclado, mando y, en el móvil, joystick flotante a la izquierda y botones con iconos a la derecha.
const entrada = new Entrada(
  [
    { nombre: 'atacar', teclas: ['KeyF'], mando: 2, etiqueta: '🪓' },
    { nombre: 'esquivar', teclas: ['Space'], mando: 0, etiqueta: '💨' },
    { nombre: 'usar', teclas: ['KeyE'], mando: 1, etiqueta: '✋' },
    { nombre: 'mochila', teclas: ['Tab', 'KeyI'], mando: 3, etiqueta: '🎒' },
    { nombre: 'construir', teclas: ['KeyB'], mando: 4, etiqueta: '🔨' },
    { nombre: 'arma', teclas: ['KeyQ'], mando: 5, etiqueta: '🔄' },
    { nombre: 'girar', teclas: ['KeyR'], mando: 6, etiqueta: '↻' },
    { nombre: 'pausa', teclas: [], mando: 9, etiqueta: '⏸' },
  ],
  controles,
);
const tactil = matchMedia('(pointer: coarse)').matches || (import.meta.env.DEV && location.search.includes('tactil'));
if (tactil) document.body.classList.add('tactil');
addEventListener('keydown', (e) => e.code === 'Tab' && e.preventDefault());

let partida: Partida | null = null;
let render: Render3D | null = null;
let modulo3d: Promise<typeof import('./game/render3d')> | null = null;
const cargar3d = () => (modulo3d ??= import('./game/render3d'));

iniciarPantallaCompleta(() => app.g.config.pantallaCompleta, 'landscape');
app.aplicarConfig();

/* ---------- Tamaño ---------- */

const rend = new Rendimiento(() => app.g.config.calidad, () => app.g.config.limiteFps, () => ajustar());
let ancho = innerWidth;
let alto = innerHeight;
function ajustar() {
  ancho = innerWidth;
  alto = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [hud, lienzo3d]) {
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
  }
  hud.width = Math.round(ancho * dpr);
  hud.height = Math.round(alto * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render?.ajustar(ancho, alto, rend.ratio);
}
addEventListener('resize', ajustar);
ajustar();

/* ---------- Cámara y golpe con el ratón ---------- */

let giroX = 0;
let giroY = 0;
let golpePendiente = false;
const sensibilidad = () => app.g.config.sensibilidad / 5;

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== lienzo3d) return;
  giroX += e.movementX * 0.0025 * sensibilidad();
  giroY += e.movementY * 0.0025 * sensibilidad();
});
lienzo3d.addEventListener('mousedown', (e) => {
  if (!partida || tactil) return;
  if (document.pointerLockElement !== lienzo3d) {
    Promise.resolve(lienzo3d.requestPointerLock()).catch(() => undefined);
    return;
  }
  if (e.button === 0) golpePendiente = true;
  if (e.button === 2 && partida.construyendo) partida.construyendo = null;
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== lienzo3d && partida?.fase === 'juego' && !partida.pausada && !tactil && document.body.classList.contains('jugando')) pausar();
});

// Táctil: arrastrar en la mitad derecha mueve la cámara.
const GIRO_TACTIL = 0.006;
const zonaMirar = h('div', { class: 'zona-mirar' });
controles.prepend(zonaMirar);
let toque = { id: -1, x: 0, y: 0 };
zonaMirar.addEventListener('pointerdown', (e) => {
  if (toque.id !== -1) return;
  zonaMirar.setPointerCapture(e.pointerId);
  toque = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
zonaMirar.addEventListener('pointermove', (e) => {
  if (e.pointerId !== toque.id) return;
  giroX += (e.clientX - toque.x) * GIRO_TACTIL * sensibilidad();
  giroY += (e.clientY - toque.y) * GIRO_TACTIL * sensibilidad();
  toque.x = e.clientX;
  toque.y = e.clientY;
});
const soltarToque = (e: PointerEvent) => e.pointerId === toque.id && (toque.id = -1);
zonaMirar.addEventListener('pointerup', soltarToque);
zonaMirar.addEventListener('pointercancel', soltarToque);

document.body.append(h('button', { type: 'button', class: 'boton-pausa', 'aria-label': 'Pausa', text: '⏸', onclick: () => pausar() }));

const vibrar = (ms: number) => app.g.config.vibracion && navigator.vibrate?.(ms);

/** Botón táctil por su nombre (para cambiar su icono). */
const botonTactil = (nombre: string) => controles.querySelector<HTMLButtonElement>(`[aria-label='${nombre}']`);
let modoMostrado = '';
/** En modo construcción los botones cambian: ✅ colocar, ↻ girar y ✖ salir. */
function iconosBotones(p: Partida) {
  const modo = p.construyendo ? 'construir' : p.arma;
  if (modo === modoMostrado) return;
  modoMostrado = modo;
  const b = p.construyendo;
  botonTactil('atacar')!.textContent = b ? '✅' : ARMAS[p.arma].icono === '✊' ? '👊' : ARMAS[p.arma].icono;
  botonTactil('esquivar')!.textContent = b ? '↻' : '💨';
  botonTactil('usar')!.textContent = b ? '✖' : '✋';
  controles.classList.toggle('construyendo', !!b);
}

/* ---------- Pantallas ---------- */

function jugando(si: boolean) {
  document.body.classList.toggle('jugando', si);
  if (!si) {
    entrada.limpiar();
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (!tactil) Promise.resolve(lienzo3d.requestPointerLock?.()).catch(() => undefined);
}

const AYUDA = tactil
  ? 'Arrastra en la mitad izquierda para moverte y en la derecha para mirar. 🪓 golpear y talar, 💨 esquivar, ✋ usar (beber, recoger bayas, asar, reparar), 🎒 mochila para fabricar y comer, 🔨 construir y 🔄 cambiar de arma. De día prepárate; de noche llegan las oleadas.'
  : 'WASD para moverte y ratón para mirar. Clic: golpear y talar. Espacio: esquivar. E: usar (beber, recoger bayas, asar, reparar). Tab: mochila para fabricar y comer. B: construir (R gira). Q: cambiar de arma. De día prepárate; de noche llegan las oleadas.';

function bienvenida() {
  jugando(false);
  const campo = h('input', { type: 'text', maxlength: '20', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre' }) as HTMLInputElement;
  const error = h('p', { class: 'error-campo', 'aria-live': 'polite' });
  const seguir = () => {
    const nombre = limpiarNombre(campo.value);
    if (!nombre) {
      error.textContent = 'Escribe tu nombre (hasta 20 caracteres).';
      return;
    }
    app.g.nombre = nombre;
    app.guardar();
    menu();
  };
  campo.addEventListener('keydown', (e) => e.key === 'Enter' && seguir());
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🏕️ McL Refugio' }),
      h('p', { class: 'texto-suave', text: 'Despiertas solo en una isla cubierta de bosque. De día recolecta, fabrica herramientas y levanta tu refugio. De noche, los salvajes del bosque atacan. ¿Cuántos días aguantarás?' }),
      campo,
      error,
      boton('Empezar', seguir, { variante: 'primario' }),
    ),
  );
  campo.focus();
}

function menu() {
  jugando(false);
  partida = null;
  const g = app.g;
  const a = g.avance;
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h1', { text: '🏕️ McL Refugio' }),
      h('p', { class: 'texto-suave', text: `¡Hola, ${app.nombre()}! · Mejor: día ${g.estadisticas.diaMax} · 🧠 ${g.puntos} recuerdos` }),
      boton(a ? `Continuar: día ${a.dia}` : 'Jugar', empezar, { variante: 'primario', icono: '▶' }),
      a ? boton('Nueva isla', () => {
        if (!confirm('Tu partida actual se pierde (no cuenta en los récords). ¿Seguro?')) return;
        g.avance = null;
        app.guardar();
        menu();
      }, { icono: '🏝️', variante: 'suave' }) : null,
      boton(`Dificultad: ${MODOS[g.config.dificultad].nombre}`, () => configuracion(), { icono: '🎯' }),
      boton('Personaje', () => void import('./ui/personaje').then((m) => m.pantallaPersonaje(menu)), { icono: '👕' }),
      boton('Recuerdos', () => pantallaRecuerdos(menu), { icono: '🧠' }),
      boton('Récords', records, { icono: '🏆' }),
      boton('Configuración', () => configuracion(), { icono: '⚙️' }),
      h('p', { class: 'texto-suave ayuda-texto', text: AYUDA }),
    ),
  );
}

function configuracion(volver: () => void = menu, enJuego = false) {
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', () => volver(), { icono: '←' }), h('h2', { text: '⚙️ Configuración' })),
      panelConfiguracion({ enJuego, alReiniciar: () => (app.g.nombre ? configuracion(volver, enJuego) : bienvenida()) }),
    ),
  );
}

function records() {
  const e = app.g.estadisticas;
  const dato = (t: string, v: string | number) => h('div', { class: 'fila-mejora' }, h('span', { text: t }), h('strong', { text: String(v) }));
  const filas = app.g.records.length
    ? app.g.records.map((r, i) => h('div', { class: 'fila-mejora' }, h('span', { text: `${i + 1}. ${r.nombre}` }), h('span', { text: `Día ${r.dias} · 👹 ${r.abatidos}` })))
    : [h('p', { class: 'texto-suave', text: 'Aún no hay récords. ¡Sobrevive todo lo que puedas!' })];
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '🏆 Récords' }),
      dato('Día más alto', e.diaMax),
      dato('Partidas', e.partidas),
      dato('Enemigos abatidos', e.abatidos),
      dato('Gigantes vencidos', e.jefes),
      dato('Caídas', e.muertes),
      h('h2', { text: 'Más días sobrevividos' }),
      ...filas,
      boton('Volver', menu, { icono: '←' }),
    ),
  );
}

/* ---------- Partida ---------- */

let marcaDano = 0;
let finMostrado = false;
let ganados = { ganados: 0, record: false };

function guardarPartida(p: Partida) {
  guardarAvance(app.g, p.avance());
  app.guardar();
}

async function empezar() {
  audio.iniciar();
  const mod = await cargar3d();
  const g = app.g;
  finMostrado = false;
  modoMostrado = '';
  const nueva = !g.avance;
  if (nueva) g.estadisticas.partidas++;
  const p: Partida = new Partida({
    semilla: g.avance?.semilla ?? semillaNueva(),
    modo: MODOS[g.config.dificultad],
    recuerdos: g.recuerdos,
    avance: g.avance,
    hambreSed: g.config.hambreSed,
    eventos: {
      golpe: (acierto) => audio.efecto(acierto ? 'golpe' : 'boton', acierto ? 1 : 0.4),
      recoger: () => audio.efecto('recoger', 0.5),
      dano: () => {
        marcaDano = 0.6;
        audio.efecto('dano');
        vibrar(40);
      },
      abatido: (t) => audio.efecto(t === 'gigante' ? 'explosion' : 'muerte', 0.8),
      construir: () => audio.efecto('golpe'),
      rota: () => audio.efecto('explosion', 0.5),
      disparo: () => audio.efecto('disparo', 0.7),
      anochece: () => {
        audio.efecto('dano', 0.6);
        vibrar(80);
      },
      amanece: () => {
        audio.efecto('nivel');
        guardarPartida(p);
      },
      guardar: () => {
        audio.efecto('nivel', 0.6);
        guardarPartida(p);
      },
      fallo: () => audio.efecto('boton', 0.4),
      fin: (r) => {
        audio.efecto('muerte');
        ganados = anotarMuerte(app.g, r, app.nombre());
        app.guardar();
      },
    },
  });
  partida = p;
  // La partida nueva queda guardada desde el principio (para poder continuarla).
  if (nueva) guardarPartida(p);
  if (import.meta.env.DEV) (window as unknown as { __partida: Partida }).__partida = p;
  if (!render) render = new mod.Render3D(lienzo3d);
  ajustar();
  mostrarPanel(null);
  jugando(true);
}

function pausar() {
  const p = partida;
  if (!p || p.fase !== 'juego' || p.pausada) return;
  p.pausada = true;
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: '⏸ Pausa' }),
      h('p', { class: 'texto-suave', text: `${p.esNoche ? '🌙 Noche' : '☀️ Día'} ${p.dia} · 👹 ${p.abatidos} · ❤️ ${Math.ceil(p.jugador.vida)}` }),
      boton('Continuar', continuar, { variante: 'primario', icono: '▶' }),
      boton('Configuración', () => configuracion(pausar2, true), { icono: '⚙️' }),
      boton('Salir', () => {
        if (!confirm('Se pierde lo hecho desde el último amanecer o el último descanso en el refugio. ¿Seguro?')) return;
        menu();
      }, { icono: '🚪' }),
    ),
  );
}

function pausar2() {
  if (!partida) return menu();
  partida.pausada = false;
  pausar();
}

function continuar() {
  if (!partida) return;
  partida.pausada = false;
  mostrarPanel(null);
  jugando(true);
}

/** Abre una pantalla del juego (mochila o construir) con la partida en pausa. */
function abrir(pantalla: (p: Partida) => void) {
  const p = partida;
  if (!p || p.fase !== 'juego' || p.pausada) return;
  p.pausada = true;
  jugando(false);
  pantalla(p);
}

const mochila = () => abrir((p) => pantallaMochila(p, continuar));
const construir = () => abrir((p) => pantallaConstruir(p, (t) => {
  p.empezarConstruir(t);
  continuar();
}, continuar, tactil));

const minutos = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function pantallaFin(r: Resumen) {
  jugando(false);
  mostrarPanel(
    h('div', { class: 'tarjeta' },
      h('h2', { text: `💀 Caíste en el día ${r.dia}` }),
      h('p', { class: 'texto-suave', text: `👹 ${r.abatidos} enemigos abatidos${r.jefes ? ` · 🏆 ${r.jefes} Gigantes` : ''} · 🧠 +${ganados.ganados} recuerdos` }),
      h('p', { class: 'texto-suave', text: ganados.record ? '🏆 ¡Entra en tus récords!' : 'Mejora tus recuerdos y vuelve a intentarlo en una isla nueva.' }),
      boton('Nueva isla', empezar, { variante: 'primario', icono: '🏝️' }),
      boton(`Recuerdos (🧠 ${app.g.puntos})`, () => pantallaRecuerdos(() => pantallaFin(r)), { icono: '🧠' }),
      boton('Menú', menu, { icono: '🏠' }),
    ),
  );
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || (e.code === 'Escape' && tactil)) pausar();
});
document.addEventListener('visibilitychange', () => document.hidden && pausar());

/* ---------- HUD ---------- */

/** Márgenes del área segura (muesca del móvil): un elemento oculto con padding env(safe-area-inset-*). */
const seguro = { izq: 0, arriba: 0, der: 0 };
const sonda = h('div', { style: 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right)' });
document.body.append(sonda);
function medirSeguro() {
  const css = getComputedStyle(sonda);
  seguro.izq = parseFloat(css.paddingLeft) || 0;
  seguro.arriba = parseFloat(css.paddingTop) || 0;
  seguro.der = parseFloat(css.paddingRight) || 0;
}
medirSeguro();
addEventListener('resize', medirSeguro);

const sombra = (texto: string, x: number, y: number, color = '#fff') => {
  ctx.fillStyle = '#000c';
  ctx.fillText(texto, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y);
};

function barra(x: number, y: number, w: number, hh: number, valor: number, color: string, fondo = '#000a') {
  ctx.fillStyle = fondo;
  ctx.fillRect(x, y, w, hh);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, Math.max(0, valor))), hh - 2);
}

/** Flecha en el borde de la pantalla hacia un punto del mundo. */
function flechaBorde(px: number, py: number, color: string, icono?: string) {
  const cx = ancho / 2;
  const cy = alto / 2;
  const ang = Math.atan2(py - cy, px - cx);
  const ax = cx + Math.cos(ang) * ancho * 0.44;
  const ay = cy + Math.sin(ang) * alto * 0.4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(ang) * 14, ay + Math.sin(ang) * 14);
  ctx.lineTo(ax + Math.cos(ang + 2.4) * 11, ay + Math.sin(ang + 2.4) * 11);
  ctx.lineTo(ax + Math.cos(ang - 2.4) * 11, ay + Math.sin(ang - 2.4) * 11);
  ctx.fill();
  if (icono) {
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    sombra(icono, ax - Math.cos(ang) * 16, ay - Math.sin(ang) * 16);
  }
}

const tecla = (t: string) => (tactil ? '' : ` (${t})`);
const RAPIDOS: IdRecurso[] = ['troncos', 'palos', 'piedras', 'cuerda'];

function dibujarHud(p: Partida, dt: number) {
  ctx.clearRect(0, 0, ancho, alto);
  ctx.textBaseline = 'middle';
  marcaDano = Math.max(0, marcaDano - dt);
  const j = p.jugador;
  const cx = ancho / 2;
  const r = render!;

  if (marcaDano > 0 || j.vida < j.vidaMax * 0.25) {
    const g = ctx.createRadialGradient(cx, alto / 2, Math.min(ancho, alto) * 0.3, cx, alto / 2, Math.max(ancho, alto) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${Math.max(marcaDano * 0.6, j.vida < j.vidaMax * 0.25 ? 0.3 : 0)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, alto);
  }

  // Vida de los enemigos, flechas hacia los que no se ven y números de daño.
  ctx.textAlign = 'center';
  for (const e of p.enemigos) {
    if (e.muerte >= 0) continue;
    const altura = e.tipo === 'gigante' ? 4.3 : e.tipo === 'saltador' ? 1.5 : 2.1;
    const pt = r.proyectar(e.x, altura, e.z, ancho, alto);
    if (!pt.visible) {
      if (app.g.config.marcarEnemigos && !e.huye && p.distancia(e.x, e.z) < 45) {
        const q = pt.detras ? { x: ancho - pt.x, y: alto - pt.y } : pt;
        flechaBorde(q.x, q.y, e.tipo === 'gigante' ? '#ffd23f' : '#ff3030', e.tipo === 'gigante' ? '👹' : undefined);
      }
      continue;
    }
    if (p.distancia(e.x, e.z) > 30) continue;
    const w = e.tipo === 'gigante' ? 70 : 40;
    barra(pt.x - w / 2, pt.y, w, 6, e.vida / e.vidaMax, '#ff5a3a', '#000c');
  }
  for (const n of p.numeros) {
    const pt = r.proyectar(n.x, 2.2 + n.t, n.z, ancho, alto);
    if (!pt.visible) continue;
    ctx.font = `bold ${n.propio ? 17 : 15}px system-ui, sans-serif`;
    sombra(String(n.valor), pt.x, pt.y, n.propio ? '#ff6a6a' : '#fff');
  }
  // Vida de las piezas dañadas cercanas.
  for (const pz of p.piezas) {
    const max = PIEZAS[pz.tipo].vida;
    if (pz.vida >= max || p.distancia(pz.x, pz.z) > 14) continue;
    const pt = r.proyectar(pz.x, pz.tipo === 'torre' ? 4.3 : 2.7, pz.z, ancho, alto);
    if (pt.visible) barra(pt.x - 22, pt.y, 44, 5, pz.vida / max, pz.vida < max * 0.3 ? '#ff5a3a' : '#c8a060', '#000c');
  }
  // El Gigante: barra grande arriba.
  const jefe = p.enemigos.find((e) => e.tipo === 'gigante' && e.muerte < 0 && !e.huye);
  if (jefe) {
    const w = Math.min(420, ancho * 0.5);
    ctx.font = 'bold 13px system-ui, sans-serif';
    sombra(`👹 ${ENEMIGOS.gigante.nombre}`, cx, 64 + seguro.arriba, '#ffd23f');
    barra(cx - w / 2, 74 + seguro.arriba, w, 10, jefe.vida / jefe.vidaMax, '#c62828');
  }

  // Vida, hambre, sed y energía (arriba a la izquierda).
  const bx = 12 + seguro.izq;
  const by = 10 + seguro.arriba;
  const bw = Math.min(tactil ? 210 : 250, ancho * 0.27);
  const filas = p.hambreSed ? 3 : 1;
  const altoPanel = filas * 20 + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx - 6, by - 6, bw + 12, altoPanel);
  ctx.strokeStyle = '#ffffff30';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - 6, by - 6, bw + 12, altoPanel);
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px system-ui, sans-serif';
  barra(bx, by, bw, 17, j.vida / j.vidaMax, j.vida > j.vidaMax * 0.3 ? '#5ad13c' : '#ff5a5a', '#401818');
  sombra(`❤️ ${Math.ceil(j.vida)}/${j.vidaMax}`, bx + 6, by + 9);
  if (p.hambreSed) {
    barra(bx, by + 20, bw, 15, j.hambre / 100, j.hambre > 25 ? '#e0a040' : '#ff5a3a', '#3a2810');
    sombra(`🍖 Hambre ${Math.ceil(j.hambre)}`, bx + 6, by + 28);
    barra(bx, by + 38, bw, 15, j.sed / 100, j.sed > 25 ? '#4ab0ff' : '#ff5a3a', '#102838');
    sombra(`💧 Sed ${Math.ceil(j.sed)}`, bx + 6, by + 46);
  }
  barra(bx, by + altoPanel - 6, bw, 4, j.energia / 100, '#ffd23f', '#0000');
  if (j.antorcha > 0) {
    ctx.font = '12px system-ui, sans-serif';
    sombra(`🔦 ${Math.ceil(j.antorcha)} s`, bx, by + altoPanel + 10, '#ffe7a0');
  }

  // Día y noche (arriba en el centro).
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  const falta = minutos(Math.max(0, Math.ceil(p.faltaCambio)));
  const vivos = p.enemigos.filter((e) => e.muerte < 0 && !e.huye).length;
  sombra(p.esNoche ? `🌙 Noche ${p.dia} · amanece en ${falta}${vivos ? ` · 👹 ${vivos}` : ''}` : `☀️ Día ${p.dia} · la noche llega en ${falta}`, cx, 18 + seguro.arriba);
  const nw = Math.min(320, ancho * 0.3);
  barra(cx - nw / 2, 30 + seguro.arriba, nw, 7, p.hora, p.esNoche ? '#6a7aff' : '#ffc83d', '#1a1a2a');
  if (app.g.config.avisoNoche && !p.esNoche && p.faltaCambio < 60) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(p.tiempo * 3));
    sombra(escalaDia(p.dia).jefe ? '⚠️ Esta noche llega el Gigante del bosque' : '⚠️ Prepárate: la noche se acerca', cx, 50 + seguro.arriba, '#ffb070');
    ctx.globalAlpha = 1;
  }

  // Arma y recursos rápidos (arriba a la derecha, junto a la pausa).
  ctx.textAlign = 'right';
  ctx.font = 'bold 14px system-ui, sans-serif';
  const dx = ancho - 66 - seguro.der;
  const a = ARMAS[p.arma];
  sombra(`${a.icono} ${a.nombre}${a.distancia ? ` · ➶ ${p.inv.flechas}` : ''}${tecla('Q')}`, dx, 22 + seguro.arriba);
  ctx.font = 'bold 13px system-ui, sans-serif';
  sombra(RAPIDOS.map((k) => `${RECURSOS[k].icono}${p.inv[k]}`).join('  '), dx, 46 + seguro.arriba);

  // Ayuda contextual (abajo en el centro).
  const yAyuda = alto - (tactil ? 24 : 30);
  let texto = '';
  let color = '#ffe7a0';
  if (p.construyendo) {
    const d = PIEZAS[p.construyendo];
    texto = `${d.icono} ${d.nombre} · ${textoCoste(d.coste)} · ${tactil ? '✅ colocar · ↻ girar · ✖ salir' : 'clic colocar · R girar · E salir'}`;
    if (!p.fantasma.valido) color = '#ff9a8a';
  } else {
    const acc = p.accionUsar();
    if (acc) texto = `${tactil ? '✋' : 'E:'} ${acc.texto}`;
  }
  if (texto) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = ctx.measureText(texto).width + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - tw / 2, yAyuda - 15, tw, 30);
    sombra(texto, cx, yAyuda, color);
  }

  if (p.mensajeT > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.globalAlpha = Math.min(1, p.mensajeT * 2);
    sombra(p.mensaje, cx, alto * 0.27, '#ffd23f');
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/* ---------- Bucle ---------- */

let fps = 60;
let ultimo = performance.now();
iniciarBucle(
  (dt) => rend.medir('logica', () => {
    entrada.actualizar();
    const p = partida;
    if (!p) return;
    if (p.fase === 'fin') {
      if (!finMostrado && p.resumen) {
        finMostrado = true;
        setTimeout(() => partida === p && pantallaFin(p.resumen!), 1200);
      }
      return;
    }
    if (p.pausada) {
      giroX = giroY = 0;
      return;
    }
    if (entrada.pulsado('pausa')) return pausar();
    if (entrada.pulsado('mochila')) return mochila();
    const c = controlesVacios();
    c.x = entrada.x;
    c.z = entrada.y;
    c.giroX = giroX;
    c.giroY = giroY;
    giroX = giroY = 0;
    c.atacar = golpePendiente || entrada.pulsado('atacar');
    golpePendiente = false;
    if (p.construyendo) {
      c.girar = entrada.pulsado('girar') || (tactil && entrada.pulsado('esquivar'));
      c.cancelar = entrada.pulsado('usar') || entrada.pulsado('construir');
    } else {
      c.esquivar = entrada.pulsado('esquivar');
      c.usar = entrada.pulsado('usar');
      c.cambiarArma = entrada.pulsado('arma');
      if (entrada.pulsado('construir')) return construir();
    }
    p.actualizar(dt, c);
    iconosBotones(p);
  }),
  (alfa) => {
    const ahora = performance.now();
    const quieto = !partida || partida.pausada || partida.fase !== 'juego';
    if (!rend.debeDibujar(ahora, quieto)) return;
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    fps = fps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    ultimo = ahora;
    if (partida && render) {
      render.sombras(tamanoSombras(app.g.config.calidad));
      rend.medir('render', () => render!.dibujar(partida!, app.g.look, app.g.config.tema === 'oscuro', !app.g.config.animacionesReducidas, dt, quieto ? 1 : alfa));
      dibujarHud(partida, dt);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ancho, alto);
    }
    if (app.g.config.mostrarFps) {
      ctx.fillStyle = '#9f9';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(fps)} FPS`, 8, alto - 8);
    }
    rend.actualizarMonitor(render?.renderer ?? null);
  },
);

if (import.meta.env.DEV && location.search.includes('demo')) {
  // Pruebas: ?demo empieza una isla nueva; &noche salta al anochecer; &dia=6 en ese día; &base pone unas piezas y recursos.
  const q = new URLSearchParams(location.search);
  app.g.avance = null;
  void empezar().then(() => {
    const p = partida!;
    if (q.has('dia')) p.dia = Number(q.get('dia')) || 1;
    if (q.has('noche')) p.tiempoDia = 178;
    if (q.has('base')) {
      for (const k of Object.keys(p.inv) as IdRecurso[]) p.inv[k] = 30;
      p.armas.push('hachaPiedra', 'arco');
      p.arma = 'hachaPiedra';
      const piezas = [['muro', -3, -5, 0], ['muro', -1, -5, 0], ['puerta', 1, -5, 0], ['pinchos', 3, -5, 0], ['torre', 5, -3, 0], ['hoguera', 1, 1, 0], ['cama', -3, 1, 0], ['trampa', 1, -9, 0]] as const;
      for (const [tipo, x, z, giro] of piezas) p.piezas.push({ id: 900 + p.piezas.length, tipo, x, z, giro, vida: PIEZAS[tipo].vida });
    }
  });
} else if (app.g.nombre) menu();
else bienvenida();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
addEventListener('load', () => setTimeout(() => void cargar3d(), 800));
