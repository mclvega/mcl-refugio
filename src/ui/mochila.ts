import { audio } from '../audio';
import { IDS_PIEZA, PIEZAS, type IdPieza } from '../core/construccion';
import { alcanza, ARMAS, COMIDAS, CURA_VENDA, IDS_RECURSO, RECETAS, RECURSOS, textoCoste, type IdRecurso } from '../core/objetos';
import type { Partida } from '../game/logica';
import { boton, h, mostrarPanel } from './dom';

/** 🎒 Mochila: recursos, comida, armas y fabricación. El juego queda en pausa mientras está abierta. */
export function pantallaMochila(p: Partida, alCerrar: () => void) {
  const pintar = () => pantallaMochila(p, alCerrar);
  const j = p.jugador;
  const recursos = h('div', { class: 'rejilla-recursos' },
    ...IDS_RECURSO.map((k) => h('div', { class: `recurso${p.inv[k] ? '' : ' vacio'}`, title: RECURSOS[k].nombre },
      h('span', { text: RECURSOS[k].icono }), h('strong', { text: String(p.inv[k]) }), h('small', { text: RECURSOS[k].nombre }))),
  );
  const comidas = (Object.keys(COMIDAS) as IdRecurso[]).map((k) => {
    const c = COMIDAS[k]!;
    const b = boton(`${RECURSOS[k].icono} Comer ${RECURSOS[k].nombre.toLowerCase()} (${p.inv[k]})`, () => {
      if (p.comer(k)) audio.efecto('recoger');
      pintar();
    }, { variante: 'suave' });
    b.disabled = p.inv[k] <= 0;
    b.title = `+${c.hambre} hambre${c.sed ? `, +${c.sed} sed` : ''}${c.vida ? `, ${c.vida > 0 ? '+' : ''}${c.vida} vida` : ''}`;
    return b;
  });
  const venda = boton(`🩹 Usar venda (+${CURA_VENDA} vida) (${p.inv.vendas})`, () => {
    if (p.vendar()) audio.efecto('nivel');
    pintar();
  }, { variante: 'suave' });
  venda.disabled = p.inv.vendas <= 0 || j.vida >= j.vidaMax;
  const antorcha = boton(`🔦 Encender antorcha (${p.inv.antorchas})`, () => {
    if (p.encenderAntorcha()) audio.efecto('recoger');
    pintar();
  }, { variante: 'suave' });
  antorcha.disabled = p.inv.antorchas <= 0;

  const armas = h('div', { class: 'segmentado' },
    ...p.armas.map((a) => {
      const b = boton(`${ARMAS[a].icono} ${ARMAS[a].nombre}`, () => {
        p.equipar(a);
        pintar();
      });
      b.setAttribute('aria-pressed', String(p.arma === a));
      return b;
    }),
  );

  const recetas = RECETAS.map((r) => {
    const tiene = !!r.arma && p.armas.includes(r.arma);
    const b = h('button', { type: 'button', class: 'btn btn-secundario receta' },
      h('strong', { text: `${r.icono} ${r.nombre}` }),
      h('small', { text: tiene ? 'Ya la tienes' : `${textoCoste(r.coste)} · ${r.texto}` }),
    );
    b.disabled = tiene || !alcanza(p.inv, r.coste);
    b.addEventListener('click', () => {
      if (p.fabricar(r)) audio.efecto('nivel');
      pintar();
    });
    return b;
  });

  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', alCerrar, { icono: '←' }), h('h2', { text: '🎒 Mochila' })),
      recursos,
      h('h3', { text: '🍖 Comer y curarse' }),
      h('div', { class: 'opciones' }, ...comidas, venda, antorcha),
      h('h3', { text: '⚔️ Arma en la mano' }),
      armas,
      h('h3', { text: '🛠️ Fabricar' }),
      h('div', { class: 'opciones recetas' }, ...recetas),
    ),
  );
}

/** 🔨 Elegir qué pieza construir. Al elegirla se vuelve al juego en modo construcción. */
export function pantallaConstruir(p: Partida, alElegir: (t: IdPieza) => void, alCerrar: () => void, tactil: boolean) {
  const piezas = IDS_PIEZA.map((t) => {
    const d = PIEZAS[t];
    const b = h('button', { type: 'button', class: 'btn btn-secundario receta' },
      h('strong', { text: `${d.icono} ${d.nombre}` }),
      h('small', { text: `${textoCoste(d.coste)} · ${d.texto}` }),
    );
    b.disabled = !alcanza(p.inv, d.coste);
    b.addEventListener('click', () => alElegir(t));
    return b;
  });
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', alCerrar, { icono: '←' }), h('h2', { text: '🔨 Construir' })),
      h('p', { class: 'texto-suave', text: tactil
        ? 'Elige una pieza. Aparecerá delante de ti: ✅ la coloca, ↻ la gira y ✖ sale.'
        : 'Elige una pieza. Aparecerá delante de ti: clic la coloca, R la gira y E sale.' }),
      h('div', { class: 'opciones recetas' }, ...piezas),
    ),
  );
}
