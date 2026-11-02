export type Dificultad = 'muyFacil' | 'facil' | 'normal' | 'desafio';

export interface Modo {
  nombre: string;
  /** Multiplicador de la vida del jugador. */
  vida: number;
  /** Multiplicador del daño de los enemigos. */
  dano: number;
  /** Multiplicador del número de enemigos de cada oleada. */
  oleada: number;
  /** Multiplicador de lo rápido que bajan el hambre y la sed. */
  hambre: number;
  /** Multiplicador de los recursos por golpe. */
  recursos: number;
  /** Dormir en el refugio salta la noche. */
  dormirNoche: boolean;
}

export const MODOS: Record<Dificultad, Modo> = {
  muyFacil: { nombre: 'Muy fácil', vida: 1.6, dano: 0.45, oleada: 0.5, hambre: 0.5, recursos: 1.6, dormirNoche: true },
  facil: { nombre: 'Fácil', vida: 1.25, dano: 0.7, oleada: 0.75, hambre: 0.75, recursos: 1.25, dormirNoche: false },
  normal: { nombre: 'Normal', vida: 1, dano: 1, oleada: 1, hambre: 1, recursos: 1, dormirNoche: false },
  desafio: { nombre: 'Desafío', vida: 0.85, dano: 1.35, oleada: 1.3, hambre: 1.25, recursos: 0.85, dormirNoche: false },
};

export const DIFICULTADES = Object.keys(MODOS) as Dificultad[];

/** Duración del día y de la noche, en segundos. */
export const DURACION_DIA = 180;
export const DURACION_NOCHE = 120;

/** Escala de los enemigos según el día (no hay final: crece sin límite, con topes para que siga siendo jugable). */
export function escalaDia(dia: number) {
  const n = Math.max(0, dia - 1);
  return {
    /** Enemigos de la oleada de la noche. */
    oleada: Math.min(48, 4 + Math.floor(n * 2)),
    vida: 1 + n * 0.18,
    dano: 1 + n * 0.1,
    /** Cada 5 noches llega el Gigante. */
    jefe: dia % 5 === 0,
  };
}
