import { app } from '../app';
import { audio } from '../audio';
import { costeRecuerdo, IDS_RECUERDO, RECUERDOS } from '../core/recuerdos';
import { boton, h, mostrarPanel } from './dom';

/** 🧠 Recuerdos: mejoras permanentes que se compran con los recuerdos de cada partida. */
export function pantallaRecuerdos(alVolver: () => void) {
  const g = app.g;
  const filas = IDS_RECUERDO.map((id) => {
    const d = RECUERDOS[id];
    const n = g.recuerdos[id];
    const max = n >= d.max;
    const coste = costeRecuerdo(n);
    const b = boton(max ? 'Máximo' : `🧠 ${coste}`, () => {
      if (max || g.puntos < coste) return;
      g.puntos -= coste;
      g.recuerdos[id]++;
      app.guardar();
      audio.efecto('nivel');
      pantallaRecuerdos(alVolver);
    }, { variante: max ? 'suave' : 'secundario' });
    b.disabled = max || g.puntos < coste;
    return h('div', { class: 'mejora-taller' },
      h('div', {}, h('strong', { text: `${d.icono} ${d.nombre} · ${n}/${d.max}` }), h('small', { text: d.texto })),
      b,
    );
  });
  mostrarPanel(
    h('div', { class: 'tarjeta ancha' },
      h('div', { class: 'cabecera' }, boton('Volver', alVolver, { icono: '←' }), h('h2', { text: '🧠 Recuerdos' })),
      h('p', { class: 'texto-suave', text: `Tienes 🧠 ${g.puntos}. Al terminar cada partida ganas 2 por día sobrevivido y 5 por cada Gigante vencido. Las mejoras sirven para todas las partidas siguientes.` }),
      ...filas,
    ),
  );
}
