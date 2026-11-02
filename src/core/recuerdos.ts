/** Recuerdos: mejoras permanentes entre partidas, que se ganan sobreviviendo días. */

export type IdRecuerdo = 'hacha' | 'vida' | 'estomago' | 'carpintero' | 'mochila';

export interface DefRecuerdo {
  nombre: string;
  icono: string;
  max: number;
  texto: string;
}

export const RECUERDOS: Record<IdRecuerdo, DefRecuerdo> = {
  hacha: { nombre: 'Hacha de la infancia', icono: '🪓', max: 1, texto: 'Empiezas cada partida con un hacha de piedra.' },
  vida: { nombre: 'Aguante', icono: '❤️', max: 5, texto: '+10 de vida máxima.' },
  estomago: { nombre: 'Estómago de hierro', icono: '🍖', max: 3, texto: 'El hambre y la sed bajan un 12 % más despacio.' },
  carpintero: { nombre: 'Carpintero', icono: '🪵', max: 3, texto: 'Recoges un tronco más cada 3 golpes al talar.' },
  mochila: { nombre: 'Mochila llena', icono: '🎒', max: 3, texto: 'Empiezas con 4 palos, 3 piedras y 2 cuerdas más.' },
};

export const IDS_RECUERDO = Object.keys(RECUERDOS) as IdRecuerdo[];

export type Recuerdos = Record<IdRecuerdo, number>;

export const recuerdosVacios = (): Recuerdos => ({ hacha: 0, vida: 0, estomago: 0, carpintero: 0, mochila: 0 });

/** Recuerdos para subir una mejora del nivel `n` al siguiente. */
export const costeRecuerdo = (n: number) => 6 + n * 6;

/** Recuerdos que se ganan al terminar una partida: por días sobrevividos y jefes vencidos. */
export const recuerdosGanados = (dias: number, jefes: number) => dias * 2 + jefes * 5;
