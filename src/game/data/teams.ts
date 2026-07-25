/**
 * Equipes e pilotos fictícios.
 *
 * Nenhum nome, marca ou identidade real é utilizado. As cores são escolhidas
 * para máxima separação em matiz E luminosidade, porque numa tela de celular
 * carros pequenos precisam ser distinguíveis a distância. Cor nunca é o único
 * sinal: cada equipe tem também um padrão de listra próprio e o número do carro
 * em destaque — o que mantém o jogo legível para daltônicos.
 */

export type PadraoListra = 'solida' | 'faixa' | 'seta' | 'dupla' | 'ponta' | 'diagonal';

export interface Equipe {
  id: string;
  nome: string;
  sigla: string;
  cor: string;
  corSecundaria: string;
  padrao: PadraoListra;
  /** Força relativa do carro (0–1). Define o ritmo base da IA. */
  desempenho: number;
}

export interface Piloto {
  id: string;
  nome: string;
  sigla: string;
  numero: number;
  equipeId: string;
  /** Habilidade relativa (0–1) — some ao desempenho do carro. */
  habilidade: number;
  pais: string;
}

export const EQUIPES: Equipe[] = [
  { id: 'corsa', nome: 'Rossa Corse', sigla: 'RSC', cor: '#E2241B', corSecundaria: '#14100F', padrao: 'solida', desempenho: 0.94 },
  { id: 'nord', nome: 'Nord Azzurra', sigla: 'NRD', cor: '#0B2E6B', corSecundaria: '#F2C230', padrao: 'seta', desempenho: 1.0 },
  { id: 'argento', nome: 'Argento Teal', sigla: 'ARG', cor: '#00A19C', corSecundaria: '#C9D2D3', padrao: 'faixa', desempenho: 0.97 },
  { id: 'papaia', nome: 'Papaia Racing', sigla: 'PPA', cor: '#FF8000', corSecundaria: '#16223D', padrao: 'ponta', desempenho: 0.96 },
  { id: 'smeraldo', nome: 'Smeraldo', sigla: 'SMR', cor: '#0E6B4F', corSecundaria: '#C6F135', padrao: 'dupla', desempenho: 0.9 },
  { id: 'ametista', nome: 'Ametista GP', sigla: 'AMT', cor: '#6C3FD1', corSecundaria: '#14101F', padrao: 'diagonal', desempenho: 0.88 },
  { id: 'platina', nome: 'Platina', sigla: 'PLT', cor: '#2FA8E0', corSecundaria: '#0C1B26', padrao: 'faixa', desempenho: 0.87 },
  { id: 'grafite', nome: 'Grafite Motors', sigla: 'GRF', cor: '#3C4148', corSecundaria: '#E63946', padrao: 'seta', desempenho: 0.85 },
  { id: 'girassol', nome: 'Girassol', sigla: 'GRS', cor: '#F5C518', corSecundaria: '#16171A', padrao: 'ponta', desempenho: 0.83 },
  { id: 'fucsia', nome: 'Fúcsia Squadra', sigla: 'FCS', cor: '#E0217A', corSecundaria: '#14101A', padrao: 'dupla', desempenho: 0.81 },
];

export const PILOTOS: Piloto[] = [
  { id: 'p1', nome: 'M. Ferrari', sigla: 'FER', numero: 7, equipeId: 'corsa', habilidade: 0.95, pais: 'IT' },
  { id: 'p2', nome: 'L. Bastos', sigla: 'BAS', numero: 21, equipeId: 'corsa', habilidade: 0.88, pais: 'PT' },
  { id: 'p3', nome: 'K. Rensen', sigla: 'REN', numero: 1, equipeId: 'nord', habilidade: 0.99, pais: 'NL' },
  { id: 'p4', nome: 'A. Volkov', sigla: 'VLK', numero: 12, equipeId: 'nord', habilidade: 0.86, pais: 'FI' },
  { id: 'p5', nome: 'D. Hartwell', sigla: 'HRT', numero: 44, equipeId: 'argento', habilidade: 0.93, pais: 'GB' },
  { id: 'p6', nome: 'T. Okada', sigla: 'OKA', numero: 63, equipeId: 'argento', habilidade: 0.9, pais: 'JP' },
  { id: 'p7', nome: 'R. Almeida', sigla: 'ALM', numero: 4, equipeId: 'papaia', habilidade: 0.92, pais: 'BR' },
  { id: 'p8', nome: 'C. Duval', sigla: 'DUV', numero: 81, equipeId: 'papaia', habilidade: 0.89, pais: 'FR' },
  { id: 'p9', nome: 'S. Kroon', sigla: 'KRN', numero: 14, equipeId: 'smeraldo', habilidade: 0.85, pais: 'BE' },
  { id: 'p10', nome: 'N. Ibarra', sigla: 'IBA', numero: 55, equipeId: 'smeraldo', habilidade: 0.84, pais: 'ES' },
  { id: 'p11', nome: 'V. Novak', sigla: 'NVK', numero: 23, equipeId: 'ametista', habilidade: 0.82, pais: 'CZ' },
  { id: 'p12', nome: 'E. Sandberg', sigla: 'SND', numero: 18, equipeId: 'ametista', habilidade: 0.8, pais: 'SE' },
  { id: 'p13', nome: 'J. Whitmore', sigla: 'WHT', numero: 27, equipeId: 'platina', habilidade: 0.81, pais: 'AU' },
  { id: 'p14', nome: 'P. Marchetti', sigla: 'MRC', numero: 9, equipeId: 'platina', habilidade: 0.78, pais: 'IT' },
  { id: 'p15', nome: 'O. Bakker', sigla: 'BKK', numero: 31, equipeId: 'grafite', habilidade: 0.79, pais: 'NL' },
  { id: 'p16', nome: 'H. Nkemdi', sigla: 'NKM', numero: 6, equipeId: 'grafite', habilidade: 0.77, pais: 'NG' },
  { id: 'p17', nome: 'G. Rosales', sigla: 'ROS', numero: 38, equipeId: 'girassol', habilidade: 0.76, pais: 'MX' },
  { id: 'p18', nome: 'F. Lindqvist', sigla: 'LND', numero: 77, equipeId: 'girassol', habilidade: 0.74, pais: 'SE' },
  { id: 'p19', nome: 'B. Tanaka', sigla: 'TNK', numero: 50, equipeId: 'fucsia', habilidade: 0.73, pais: 'JP' },
  { id: 'p20', nome: 'I. Costa', sigla: 'CST', numero: 16, equipeId: 'fucsia', habilidade: 0.72, pais: 'BR' },
];

export const equipePorId = (id: string) => EQUIPES.find((e) => e.id === id) ?? EQUIPES[0];
export const pilotoPorId = (id: string) => PILOTOS.find((p) => p.id === id) ?? PILOTOS[0];

/** O piloto que o jogador controla por padrão. */
export const PILOTO_JOGADOR: Piloto = {
  id: 'voce', nome: 'Você', sigla: 'VCE', numero: 11,
  equipeId: 'papaia', habilidade: 0.9, pais: 'BR',
};
