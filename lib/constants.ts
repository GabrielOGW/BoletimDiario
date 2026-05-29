/** Chave única do LocalStorage (versionada para migrações futuras). */
export const STORAGE_KEY = 'bdc:boletins:v1';

/** Evento interno disparado quando a store muda (reatividade entre telas). */
export const STORE_EVENT = 'bdc:store-change';

/**
 * Presets para <datalist> — aceleram o preenchimento em set sem travar o campo
 * (todos os inputs continuam sendo texto livre).
 */
export const PRESETS = {
  formatoGravacao: [
    'R3D (REDCODE RAW)',
    'ARRIRAW',
    'BRAW',
    'X-OCN',
    'ProRes 4444 XQ',
    'ProRes 4444',
    'ProRes 422 HQ',
    'ProRes 422',
    'XAVC',
    'H.265',
  ],
  resolucao: [
    '8K',
    '6K',
    '5K 17:9',
    '4K DCI (4096x2160)',
    '4K UHD (3840x2160)',
    '3.4K Open Gate',
    '2K',
    'HD (1920x1080)',
  ],
  frameRate: ['23.98', '24', '25', '29.97', '30', '48', '50', '59.94', '60', '120'],
  iso: ['200', '320', '400', '500', '640', '800', '1250', '1600', '2500', '3200'],
  obturador: ['45', '90', '144', '172.8', '180', '270', '360'],
  balancoBranco: ['3200K', '4300K', '5300K', '5600K', '6500K'],
  lutPerfil: ['Rec.709', 'Log C', 'RedLogFilm', 'V-Log', 'S-Log3', 'C-Log3'],
  espacoCor: ['Rec.709', 'Rec.2020', 'P3-D65', 'AWG3', 'REDWideGamutRGB', 'S-Gamut3'],
  diafragma: ['T1.4', 'T2', 'T2.8', 'T4', 'T5.6', 'T8', 'T11', 'T16'],
  lentes: [
    '16mm',
    '18mm',
    '25mm',
    '32mm',
    '35mm',
    '40mm',
    '50mm',
    '65mm',
    '75mm',
    '100mm',
    '135mm',
  ],
  filtros: [
    'ND 0.3',
    'ND 0.6',
    'ND 0.9',
    'ND 1.2',
    'Pol',
    'Black Pro-Mist 1/8',
    'Black Pro-Mist 1/4',
    'Black Pro-Mist 1/2',
  ],
  tipoMidia: ['CFexpress', 'CFast 2.0', 'SSD', 'RED MINI-MAG', 'SxS', 'SD'],
  funcao: [
    'Operador(a)',
    '1º AC / Foco',
    '2º AC',
    'Claquetista',
    'DIT',
    'Loader',
    'Vídeo Assist',
  ],
} as const;
