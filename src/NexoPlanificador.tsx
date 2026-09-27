/**
 * Nexo · Planificador de Carrera y Trayectoria Curricular (MVP)
 * Universidad de la Ciudad (CABA) · Escuela de Tecnologías e Industrias Digitales (ETID)
 *
 * Componente único y autocontenido (React 18 + TypeScript + Tailwind + lucide-react).
 *
 * Núcleo del producto:
 *   1. El estudiante marca cada materia como Pendiente, Regular o Aprobada.
 *   2. A partir de eso se deriva, en cada render, el estado académico de todo el plan
 *      (Aprobada · Regular · Habilitada · Bloqueada) resolviendo las correlatividades.
 *   3. Sobre ese grafo se calculan la ruta crítica, el plan de cursada sugerido
 *      y la recomendación de optativas por intereses.
 *
 * Los colores institucionales van con `style` para no depender de valores arbitrarios
 * de Tailwind (no todos los entornos de Artifacts los compilan).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Compass,
  Flag,
  GitBranch,
  GraduationCap,
  Info,
  Lock,
  Map as MapIcon,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Unlock,
  Users,
  X,
  Zap,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Identidad visual
// ─────────────────────────────────────────────────────────────────────────────

const MARCA = {
  magenta: '#B02483',
  magentaOscuro: '#9C2780',
  violeta: '#6A1B9A',
  violetaOscuro: '#4A148C',
  lavanda: '#F3E5F5',
  lavandaClaro: '#FAF5FF',
} as const;

const GRADIENTE = `linear-gradient(135deg, ${MARCA.magenta} 0%, ${MARCA.magentaOscuro} 45%, ${MARCA.violeta} 100%)`;
const GRADIENTE_BANNER = `linear-gradient(120deg, ${MARCA.magenta} 0%, ${MARCA.violeta} 60%, ${MARCA.violetaOscuro} 100%)`;

const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que declara el estudiante. */
type EstadoAlumno = 'pendiente' | 'regular' | 'aprobada';
/** Lo que calcula Nexo a partir de lo declarado y de las correlatividades. */
type EstadoAcademico = 'aprobada' | 'regular' | 'habilitada' | 'bloqueada';
type Pilar = 'Inteligencia Artificial' | 'Análisis de Datos' | 'Negocios Digitales' | 'Desarrollo' | 'Videojuegos' | 'Gestión Ágil';
type Vista = 'mapa' | 'proyector' | 'optativas';

/**
 * Una correlativa. `condicion` indica qué necesita tener el estudiante en la materia previa
 * para poder CURSAR la actual: 'regular' acepta regular o aprobada; 'aprobada' exige el final.
 */
interface Requisito {
  codigo: string;
  condicion: 'regular' | 'aprobada';
}

interface Materia {
  codigo: string;
  nombre: string;
  requisitos: Requisito[];
  horas: number; // horas semanales de cursada
  creditos: number;
  areas: Pilar[];
  resumen: string;
  ilustrativa?: boolean; // materia de ejemplo, no provista en el plan oficial
}

interface Carrera {
  id: string;
  nombre: string;
  corto: string;
  obligatorias: string[];
  optativas: string[];
  optativasRequeridas: number;
  nota?: string;
}

interface Simulacion {
  id: number;
  carrera: string;
  materias: string[];
  horas: number;
  fecha: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo de estados académicos
// ─────────────────────────────────────────────────────────────────────────────

const SEMAFORO: Record<EstadoAcademico, { etiqueta: string; color: string; fondo: string; borde: string; texto: string }> = {
  aprobada: { etiqueta: 'Aprobada', color: '#10B981', fondo: '#ECFDF5', borde: '#A7F3D0', texto: '#047857' },
  regular: { etiqueta: 'Regular', color: '#0284C7', fondo: '#E0F2FE', borde: '#BAE6FD', texto: '#0369A1' },
  habilitada: { etiqueta: 'Habilitada', color: MARCA.magenta, fondo: '#FDF2F8', borde: '#F5C2E0', texto: MARCA.magenta },
  bloqueada: { etiqueta: 'Bloqueada', color: '#9CA3AF', fondo: '#F3F4F6', borde: '#E5E7EB', texto: '#6B7280' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de materias (ETID). Horas y créditos son valores de referencia del MVP.
// ─────────────────────────────────────────────────────────────────────────────

const req = (codigo: string, condicion: Requisito['condicion'] = 'aprobada'): Requisito => ({ codigo, condicion });

const MATERIAS: Materia[] = [
  // ── Obligatorias ──
  { codigo: 'ASIG00120', nombre: 'Gestión de Sistemas de Información', requisitos: [], horas: 4, creditos: 8, areas: ['Negocios Digitales', 'Gestión Ágil'], resumen: 'Sistemas de información en organizaciones y su rol estratégico.' },
  { codigo: 'ASIG00121', nombre: 'Análisis de Datos I', requisitos: [], horas: 4, creditos: 8, areas: ['Análisis de Datos'], resumen: 'Fundamentos de estadística descriptiva y exploración de datos.' },
  { codigo: 'ASIG00124', nombre: 'Sistemas Digitales', requisitos: [], horas: 6, creditos: 8, areas: ['Desarrollo'], resumen: 'Arquitectura de computadoras, lógica digital y sistemas operativos.' },
  { codigo: 'ASIG00122', nombre: 'Taller: Gestión de Proyectos Digitales', requisitos: [req('ASIG00120', 'regular')], horas: 4, creditos: 8, areas: ['Gestión Ágil'], resumen: 'Metodologías ágiles, SCRUM y gestión de proyectos reales.' },
  { codigo: 'ASIG00123', nombre: 'Administración de Negocios Digitales', requisitos: [req('ASIG00120')], horas: 4, creditos: 8, areas: ['Negocios Digitales'], resumen: 'Modelos de negocio, plataformas y economía digital.' },
  { codigo: 'ASIG00126', nombre: 'Seguridad de la Información', requisitos: [req('ASIG00124')], horas: 4, creditos: 8, areas: ['Desarrollo'], resumen: 'Criptografía, gestión de riesgos y normativa de protección de datos.' },
  { codigo: 'ASIG00127', nombre: 'Programación de Vanguardia', requisitos: [req('ASIG00124')], horas: 6, creditos: 8, areas: ['Desarrollo'], resumen: 'Paradigmas modernos de programación y desarrollo de software.' },
  { codigo: 'ASIG00125', nombre: 'Taller: Emprendedurismo en Innovación Digital', requisitos: [req('ASIG00122'), req('ASIG00123')], horas: 4, creditos: 8, areas: ['Negocios Digitales', 'Gestión Ágil'], resumen: 'Del problema al pitch: validación y lanzamiento de un emprendimiento.' },
  { codigo: 'ASIG00128', nombre: 'Taller: Control de Calidad de Software', requisitos: [req('ASIG00127')], horas: 4, creditos: 8, areas: ['Desarrollo', 'Gestión Ágil'], resumen: 'Testing, automatización y aseguramiento de la calidad.' },

  // ── Optativas ──
  { codigo: 'ASIG00131', nombre: 'Análisis de Datos II: Sistemas Expertos y Redes de Conocimiento', requisitos: [req('ASIG00121')], horas: 4, creditos: 6, areas: ['Análisis de Datos', 'Inteligencia Artificial'], resumen: 'Representación del conocimiento, reglas y sistemas expertos.' },
  { codigo: 'ASIG00201', nombre: 'Business Intelligence', requisitos: [req('ASIG00121')], horas: 4, creditos: 6, areas: ['Análisis de Datos', 'Negocios Digitales'], resumen: 'Tableros, KPIs y modelado dimensional para la toma de decisiones.' },
  { codigo: 'ASIG00199', nombre: 'Bases de Datos', requisitos: [req('ASIG00124')], horas: 4, creditos: 6, areas: ['Desarrollo', 'Análisis de Datos'], resumen: 'Modelo relacional, SQL y diseño de bases de datos.' },
  { codigo: 'ASIG00350', nombre: 'Elementos de Programación IA y LowCode', requisitos: [req('ASIG00127')], horas: 4, creditos: 6, areas: ['Inteligencia Artificial', 'Desarrollo'], resumen: 'Integración de modelos de IA y herramientas low-code.' },
  { codigo: 'ASIG00133', nombre: 'Diseño y Producción de Videojuegos', requisitos: [req('ASIG00124')], horas: 4, creditos: 6, areas: ['Videojuegos', 'Desarrollo'], resumen: 'Game design, motores de juego y producción de un prototipo.' },
  { codigo: 'ASIG00297', nombre: 'Transformación Digital en las Organizaciones', requisitos: [req('ASIG00122')], horas: 4, creditos: 6, areas: ['Negocios Digitales', 'Gestión Ágil'], resumen: 'Gestión del cambio y adopción tecnológica en organizaciones.' },

  // ── Ciencias de Datos: materias ilustrativas (reemplazar por el plan oficial) ──
  { codigo: 'CD-EST1', nombre: 'Estadística y Probabilidad', requisitos: [], horas: 6, creditos: 8, areas: ['Análisis de Datos'], resumen: 'Probabilidad, variables aleatorias e inferencia.', ilustrativa: true },
  { codigo: 'CD-PY1', nombre: 'Programación para Ciencia de Datos', requisitos: [req('ASIG00124', 'regular')], horas: 6, creditos: 8, areas: ['Desarrollo', 'Análisis de Datos'], resumen: 'Python, pandas y notebooks reproducibles.', ilustrativa: true },
  { codigo: 'CD-VIS', nombre: 'Visualización de Datos', requisitos: [req('ASIG00121')], horas: 4, creditos: 8, areas: ['Análisis de Datos'], resumen: 'Diseño de gráficos y narrativa con datos.', ilustrativa: true },
  { codigo: 'CD-ML1', nombre: 'Aprendizaje Automático', requisitos: [req('CD-EST1'), req('CD-PY1')], horas: 6, creditos: 8, areas: ['Inteligencia Artificial', 'Análisis de Datos'], resumen: 'Modelos supervisados y no supervisados.', ilustrativa: true },
  { codigo: 'CD-ING', nombre: 'Ingeniería de Datos', requisitos: [req('CD-PY1'), req('ASIG00199', 'regular')], horas: 4, creditos: 8, areas: ['Desarrollo', 'Análisis de Datos'], resumen: 'Pipelines, ETL y almacenamiento a escala.', ilustrativa: true },
];

const CATALOGO: Record<string, Materia> = Object.fromEntries(MATERIAS.map((m) => [m.codigo, m]));

const CARRERAS: Carrera[] = [
  {
    id: 'ltd',
    nombre: 'Licenciatura en Tecnologías Digitales',
    corto: 'Tecnologías Digitales',
    obligatorias: ['ASIG00120', 'ASIG00121', 'ASIG00124', 'ASIG00122', 'ASIG00123', 'ASIG00126', 'ASIG00127', 'ASIG00125', 'ASIG00128'],
    optativas: ['ASIG00131', 'ASIG00201', 'ASIG00199', 'ASIG00350', 'ASIG00133', 'ASIG00297'],
    optativasRequeridas: 3,
  },
  {
    id: 'lcd',
    nombre: 'Licenciatura en Ciencias de Datos',
    corto: 'Ciencias de Datos',
    obligatorias: ['ASIG00120', 'ASIG00121', 'ASIG00124', 'CD-EST1', 'CD-PY1', 'CD-VIS', 'ASIG00199', 'CD-ML1', 'CD-ING'],
    optativas: ['ASIG00131', 'ASIG00201', 'ASIG00133', 'ASIG00127'],
    optativasRequeridas: 2,
    nota: 'Las materias con código CD-… son ilustrativas: cargá el plan oficial antes de usarlo para inscribirte.',
  },
];

const PILARES: { id: Pilar; descripcion: string }[] = [
  { id: 'Inteligencia Artificial', descripcion: 'Modelos, automatización y sistemas inteligentes' },
  { id: 'Análisis de Datos', descripcion: 'Estadística, tableros y decisiones basadas en datos' },
  { id: 'Negocios Digitales', descripcion: 'Emprendimientos, plataformas y estrategia' },
  { id: 'Desarrollo', descripcion: 'Programación, bases de datos y software' },
  { id: 'Videojuegos', descripcion: 'Diseño y producción interactiva' },
  { id: 'Gestión Ágil', descripcion: 'Proyectos, equipos y transformación' },
];

/** Punto de partida de la demo: un estudiante de 2.º año con algo de avance. */
const ESTADO_INICIAL: Record<string, EstadoAlumno> = {
  ASIG00120: 'aprobada',
  ASIG00121: 'aprobada',
  ASIG00124: 'regular',
  ASIG00122: 'regular',
};

const ESTUDIANTE = { nombre: 'Martina Sosa', iniciales: 'MS', legajo: '48.215' };

const COMPANEROS_MOCK = [
  { nombre: 'Tomás Herrera', turno: 'Noche', iniciales: 'TH' },
  { nombre: 'Lucía Benítez', turno: 'Tarde', iniciales: 'LB' },
  { nombre: 'Joaquín Paz', turno: 'Noche', iniciales: 'JP' },
  { nombre: 'Camila Duarte', turno: 'Mañana', iniciales: 'CD' },
  { nombre: 'Ezequiel Romero', turno: 'Noche', iniciales: 'ER' },
  { nombre: 'Florencia Acosta', turno: 'Tarde', iniciales: 'FA' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Motor de correlatividades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿El estudiante cumple esta correlativa?
 * - condición 'regular': alcanza con tener la previa regularizada (o aprobada).
 * - condición 'aprobada': hace falta el final aprobado; la regularidad no alcanza.
 */
function cumpleRequisito(r: Requisito, estados: Record<string, EstadoAlumno>): boolean {
  const e = estados[r.codigo] ?? 'pendiente';
  return r.condicion === 'regular' ? e === 'regular' || e === 'aprobada' : e === 'aprobada';
}

/** Correlativas que todavía le faltan para poder cursar la materia. */
function requisitosFaltantes(codigo: string, estados: Record<string, EstadoAlumno>): Requisito[] {
  return CATALOGO[codigo]!.requisitos.filter((r) => !cumpleRequisito(r, estados));
}

/**
 * Estado académico derivado. Lo declarado (regular/aprobada) manda; si la materia está
 * pendiente, queda Habilitada sólo cuando se cumplen TODAS sus correlativas.
 */
function estadoAcademico(codigo: string, estados: Record<string, EstadoAlumno>): EstadoAcademico {
  const declarado = estados[codigo] ?? 'pendiente';
  if (declarado === 'aprobada') return 'aprobada';
  if (declarado === 'regular') return 'regular';
  return requisitosFaltantes(codigo, estados).length === 0 ? 'habilitada' : 'bloqueada';
}

/** Mapa inverso: para cada materia del plan, qué materias del plan la tienen como correlativa. */
function construirDependientes(plan: string[]): Record<string, string[]> {
  const dependientes: Record<string, string[]> = Object.fromEntries(plan.map((c) => [c, [] as string[]]));
  for (const codigo of plan) {
    for (const r of CATALOGO[codigo]!.requisitos) {
      if (dependientes[r.codigo]) dependientes[r.codigo]!.push(codigo);
    }
  }
  return dependientes;
}

/**
 * Materias que "destraba" una materia: todas las que dependen de ella directa o
 * indirectamente (recorrido en anchura sobre el grafo inverso) y que el estudiante
 * todavía no cursó. Es la medida de impacto que usa el recomendador.
 */
function materiasQueDestraba(codigo: string, dependientes: Record<string, string[]>, estados: Record<string, EstadoAlumno>): string[] {
  const vistas = new Set<string>();
  const cola = [...(dependientes[codigo] ?? [])];
  while (cola.length > 0) {
    const actual = cola.shift()!;
    if (vistas.has(actual)) continue;
    vistas.add(actual);
    cola.push(...(dependientes[actual] ?? []));
  }
  return [...vistas].filter((c) => (estados[c] ?? 'pendiente') === 'pendiente');
}

/** Largo de la cadena de correlativas más larga que cuelga de la materia (ruta crítica). */
function profundidadCritica(codigo: string, dependientes: Record<string, string[]>, memo: Map<string, number> = new Map()): number {
  if (memo.has(codigo)) return memo.get(codigo)!;
  const hijos = dependientes[codigo] ?? [];
  const valor = hijos.length === 0 ? 0 : 1 + Math.max(...hijos.map((h) => profundidadCritica(h, dependientes, memo)));
  memo.set(codigo, valor);
  return valor;
}

/** Cuatrimestre sugerido en la malla: 1 si no tiene correlativas; si no, uno más que su correlativa más avanzada. */
function nivelEnPlan(codigo: string, plan: Set<string>, memo: Map<string, number> = new Map()): number {
  if (memo.has(codigo)) return memo.get(codigo)!;
  const previas = CATALOGO[codigo]!.requisitos.filter((r) => plan.has(r.codigo));
  const nivel = previas.length === 0 ? 1 : 1 + Math.max(...previas.map((r) => nivelEnPlan(r.codigo, plan, memo)));
  memo.set(codigo, nivel);
  return nivel;
}

/**
 * Pasos previos para llegar a una materia bloqueada: recorre las correlativas faltantes
 * en profundidad y devuelve la secuencia en orden de cursada (primero lo más básico).
 */
function caminoPrevio(codigo: string, estados: Record<string, EstadoAlumno>, visitadas: Set<string> = new Set()): { codigo: string; accion: string }[] {
  const pasos: { codigo: string; accion: string }[] = [];
  for (const r of requisitosFaltantes(codigo, estados)) {
    if (visitadas.has(r.codigo)) continue;
    visitadas.add(r.codigo);
    pasos.push(...caminoPrevio(r.codigo, estados, visitadas));
    const actual = estados[r.codigo] ?? 'pendiente';
    pasos.push({ codigo: r.codigo, accion: actual === 'regular' ? 'Rendir el final' : r.condicion === 'regular' ? 'Cursar y regularizar' : 'Cursar y aprobar' });
  }
  return pasos;
}

/** Siguiente estado del selector de 1 clic: Pendiente → Regular → Aprobada → Pendiente. */
const SIGUIENTE: Record<EstadoAlumno, EstadoAlumno> = { pendiente: 'regular', regular: 'aprobada', aprobada: 'pendiente' };

const cantidadFija = (codigo: string) => (codigo.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 4) + 2;

const nombreCorto = (codigo: string) => CATALOGO[codigo]?.nombre.replace(/^Taller: /, '').split(':')[0] ?? codigo;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ─────────────────────────────────────────────────────────────────────────────
// Componentes de presentación
// ─────────────────────────────────────────────────────────────────────────────

function EncabezadoCampus({ pendientesRevision }: { pendientesRevision: number }) {
  return (
    <header>
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl font-extrabold text-white shadow-sm" style={{ background: GRADIENTE }}>
              U
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-gray-800">
                U <span style={{ color: MARCA.magenta }}>de la Ciudad</span>
              </p>
              <p className="text-xs text-gray-500">Campus Virtual</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex" aria-label="Campus">
            <span className="cursor-default">Mis cursos</span>
            <span className="cursor-default">Calendario</span>
            <span className="font-semibold" style={{ color: MARCA.magenta }}>
              Vida Universitaria
            </span>
          </nav>
          <div className="flex items-center gap-2">
            <span className="relative rounded-xl p-2 text-gray-600" aria-label={`${pendientesRevision} avisos`}>
              <Bell className="h-5 w-5" />
              {pendientesRevision > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 items-center justify-center rounded-full px-1 font-bold text-white" style={{ background: MARCA.magenta, minWidth: 20, fontSize: 10 }}>
                  {pendientesRevision}
                </span>
              )}
            </span>
            <div className="flex items-center gap-2 py-1 pl-1 pr-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: GRADIENTE }}>
                {ESTUDIANTE.iniciales}
              </div>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-semibold text-gray-800">{ESTUDIANTE.nombre}</span>
                <span className="block text-xs text-gray-500">Estudiante · Legajo {ESTUDIANTE.legajo}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function PildoraEstado({ estado, tamano = 'sm' }: { estado: EstadoAcademico; tamano?: 'sm' | 'xs' }) {
  const s = SEMAFORO[estado];
  const Icono = estado === 'aprobada' ? CheckCircle2 : estado === 'regular' ? BookOpen : estado === 'habilitada' ? Sparkles : Lock;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ${tamano === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'}`}
      style={{ background: s.fondo, color: s.texto, boxShadow: `inset 0 0 0 1px ${s.borde}` }}
    >
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {s.etiqueta}
    </span>
  );
}

/** Tarjeta de materia con selector de estado, faltantes y acceso a compañeros. */
function TarjetaMateria({
  codigo,
  estados,
  destraba,
  recienHabilitada,
  resaltada,
  inconsistente,
  onCambiarEstado,
  onEnfocar,
  onVerCompaneros,
}: {
  codigo: string;
  estados: Record<string, EstadoAlumno>;
  destraba: number;
  recienHabilitada: boolean;
  resaltada: boolean;
  inconsistente: boolean;
  onCambiarEstado: (codigo: string, estado: EstadoAlumno) => void;
  onEnfocar: (codigo: string | null) => void;
  onVerCompaneros: (codigo: string) => void;
}) {
  const materia = CATALOGO[codigo]!;
  const estado = estadoAcademico(codigo, estados);
  const declarado = estados[codigo] ?? 'pendiente';
  const faltantes = requisitosFaltantes(codigo, estados);
  const s = SEMAFORO[estado];
  const [abierta, setAbierta] = useState(false);
  const bloqueada = estado === 'bloqueada';

  return (
    <article
      onMouseEnter={() => onEnfocar(codigo)}
      onMouseLeave={() => onEnfocar(null)}
      className={`relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition duration-300 hover:shadow-md ${recienHabilitada ? 'nexo-pop' : ''}`}
      style={{
        borderColor: resaltada ? MARCA.magenta : s.borde,
        boxShadow: resaltada ? `0 0 0 3px ${MARCA.lavanda}` : undefined,
        background: bloqueada ? '#FAFAFA' : '#FFFFFF',
      }}
    >
      {/* Franja de color del semáforo */}
      <span className="absolute inset-x-4 top-0 h-1 rounded-b-full" style={{ background: s.color }} aria-hidden />

      <div className="flex items-start justify-between gap-2 pt-1">
        <span className="font-mono text-xs font-semibold tracking-wide text-gray-400">{codigo}</span>
        <PildoraEstado estado={estado} tamano="xs" />
      </div>

      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        className={`mt-1.5 rounded text-left ${FOCO}`}
        aria-expanded={abierta}
      >
        <h4 className={`text-sm font-bold leading-snug ${bloqueada ? 'text-gray-500' : 'text-gray-800'}`}>{materia.nombre}</h4>
      </button>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span>{materia.horas} h/sem</span>
        <span>{materia.creditos} créditos</span>
        {destraba > 0 && (
          <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: MARCA.violeta }} title="Materias que dependen de esta y todavía no cursaste">
            <GitBranch className="h-3 w-3" aria-hidden /> destraba {destraba}
          </span>
        )}
        {materia.ilustrativa && <span className="rounded bg-amber-50 px-1 text-amber-700">ejemplo</span>}
      </div>

      {recienHabilitada && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold" style={{ color: MARCA.magenta }}>
          <Unlock className="h-3.5 w-3.5" aria-hidden /> ¡Recién habilitada!
        </p>
      )}

      {/* Correlativas faltantes: visibles al pasar el mouse (se resaltan en la malla) o al tocar el título */}
      {bloqueada && (
        <div className={`mt-2 rounded-xl bg-gray-50 p-2 text-xs text-gray-600 ${abierta || resaltada ? 'block' : 'hidden'}`}>
          <p className="font-semibold text-gray-700">Te falta:</p>
          <ul className="mt-1 space-y-0.5">
            {faltantes.map((r) => (
              <li key={r.codigo} className="flex items-start gap-1">
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                <span>
                  {r.condicion === 'regular' ? 'Regularizar' : (estados[r.codigo] ?? 'pendiente') === 'regular' ? 'Rendir el final de' : 'Aprobar'} <b>{nombreCorto(r.codigo)}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {abierta && !bloqueada && <p className="mt-2 text-xs leading-relaxed text-gray-500">{materia.resumen}</p>}

      {inconsistente && (
        <p className="mt-2 flex items-start gap-1 rounded-lg bg-amber-50 p-1.5 text-xs font-medium text-amber-800">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          Figura cursada, pero falta su correlativa. Revisá el estado.
        </p>
      )}

      <div className="mt-auto pt-3">
        {/* Selector de estado: un clic por opción. Bloqueadas no se pueden marcar hasta cumplir correlativas. */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label={`Estado de ${materia.nombre}`}>
          {(['pendiente', 'regular', 'aprobada'] as const).map((opcion) => {
            const activa = declarado === opcion;
            const deshabilitada = bloqueada && opcion !== 'pendiente' && declarado === 'pendiente';
            const color = opcion === 'aprobada' ? SEMAFORO.aprobada : opcion === 'regular' ? SEMAFORO.regular : null;
            return (
              <button
                key={opcion}
                type="button"
                role="radio"
                aria-checked={activa}
                disabled={deshabilitada}
                onClick={() => onCambiarEstado(codigo, opcion)}
                title={deshabilitada ? 'Primero cumplí las correlativas' : undefined}
                className={`rounded-lg py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${activa ? 'shadow-sm' : 'text-gray-500 hover:text-gray-800'} ${FOCO}`}
                style={activa ? { background: color ? color.color : '#FFFFFF', color: color ? '#FFFFFF' : '#374151' } : undefined}
              >
                {opcion === 'pendiente' ? 'Pend.' : opcion === 'regular' ? 'Regular' : 'Aprob.'}
              </button>
            );
          })}
        </div>

        {estado === 'habilitada' && (
          <button
            type="button"
            onClick={() => onVerCompaneros(codigo)}
            className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-semibold transition hover:underline ${FOCO}`}
            style={{ color: MARCA.violeta }}
          >
            <Users className="h-3.5 w-3.5" aria-hidden /> Ver estudiantes planificando esta materia ({cantidadFija(codigo)})
          </button>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista 1 · Mapa curricular
// ─────────────────────────────────────────────────────────────────────────────

function MapaCurricular({
  carrera,
  estados,
  dependientes,
  recientes,
  inconsistentes,
  onCambiarEstado,
  onVerCompaneros,
}: {
  carrera: Carrera;
  estados: Record<string, EstadoAlumno>;
  dependientes: Record<string, string[]>;
  recientes: Set<string>;
  inconsistentes: Set<string>;
  onCambiarEstado: (codigo: string, estado: EstadoAlumno) => void;
  onVerCompaneros: (codigo: string) => void;
}) {
  const [enfocada, setEnfocada] = useState<string | null>(null);

  // Agrupa las obligatorias por cuatrimestre sugerido según la profundidad de sus correlativas
  const columnas = useMemo(() => {
    const plan = new Set(carrera.obligatorias);
    const memo = new Map<string, number>();
    const porNivel = new Map<number, string[]>();
    for (const c of carrera.obligatorias) {
      const n = nivelEnPlan(c, plan, memo);
      porNivel.set(n, [...(porNivel.get(n) ?? []), c]);
    }
    return [...porNivel.entries()].sort((a, b) => a[0] - b[0]);
  }, [carrera]);

  // Al enfocar una materia bloqueada se resaltan en la malla las correlativas que le faltan
  const resaltadas = useMemo(() => {
    if (!enfocada) return new Set<string>();
    return new Set(requisitosFaltantes(enfocada, estados).map((r) => r.codigo));
  }, [enfocada, estados]);

  const tarjeta = (codigo: string) => (
    <TarjetaMateria
      key={codigo}
      codigo={codigo}
      estados={estados}
      destraba={materiasQueDestraba(codigo, dependientes, estados).length}
      recienHabilitada={recientes.has(codigo)}
      resaltada={resaltadas.has(codigo)}
      inconsistente={inconsistentes.has(codigo)}
      onCambiarEstado={onCambiarEstado}
      onEnfocar={setEnfocada}
      onVerCompaneros={onVerCompaneros}
    />
  );

  return (
    <section aria-label="Mapa curricular" className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 shadow-sm">
        <span className="font-semibold text-gray-700">Semáforo:</span>
        {(Object.keys(SEMAFORO) as EstadoAcademico[]).map((e) => (
          <PildoraEstado key={e} estado={e} tamano="xs" />
        ))}
        <span className="flex items-center gap-1 text-gray-500 sm:ml-auto">
          <Info className="h-3.5 w-3.5" aria-hidden /> Pasá el mouse por una materia bloqueada para ver qué le falta.
        </span>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <Flag className="h-4 w-4" aria-hidden /> Obligatorias
        </h3>
        <div className="grid gap-5 md:grid-cols-3">
          {columnas.map(([nivel, codigos]) => (
            <div key={nivel} className="rounded-2xl bg-gray-50/80 p-3 ring-1 ring-gray-200">
              <p className="mb-3 flex items-center justify-between px-1 text-xs font-semibold text-gray-500">
                <span>{nivel}.º cuatrimestre sugerido</span>
                <span className="tabular-nums">{codigos.filter((c) => estadoAcademico(c, estados) === 'aprobada').length}/{codigos.length}</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">{codigos.map(tarjeta)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <Compass className="h-4 w-4" aria-hidden /> Optativas · elegís {carrera.optativasRequeridas}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{carrera.optativas.map(tarjeta)}</div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista 2 · Proyector de cursada
// ─────────────────────────────────────────────────────────────────────────────

interface Candidata {
  codigo: string;
  destraba: string[];
  profundidad: number;
  obligatoria: boolean;
  puntaje: number;
}

function Proyector({
  carrera,
  estados,
  dependientes,
  simulaciones,
  onGuardar,
  onBorrarSimulacion,
  onAvisar,
}: {
  carrera: Carrera;
  estados: Record<string, EstadoAlumno>;
  dependientes: Record<string, string[]>;
  simulaciones: Simulacion[];
  onGuardar: (materias: string[], horas: number) => void;
  onBorrarSimulacion: (id: number) => void;
  onAvisar: (texto: string) => void;
}) {
  const [cantidad, setCantidad] = useState(3);
  const [incluirOptativas, setIncluirOptativas] = useState(true);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const plan = useMemo(() => [...carrera.obligatorias, ...carrera.optativas], [carrera]);

  /**
   * Puntaje de cada materia habilitada:
   *   destraba × 3   → cuántas materias futuras libera (impacto directo)
   *   profundidad × 2 → qué tan larga es la cadena que cuelga de ella (ruta crítica)
   *   +2 si es obligatoria (las optativas pueden esperar)
   */
  const candidatas = useMemo<Candidata[]>(() => {
    const memo = new Map<string, number>();
    return plan
      .filter((c) => estadoAcademico(c, estados) === 'habilitada')
      .filter((c) => incluirOptativas || carrera.obligatorias.includes(c))
      .map((c) => {
        const destraba = materiasQueDestraba(c, dependientes, estados);
        const profundidad = profundidadCritica(c, dependientes, memo);
        const obligatoria = carrera.obligatorias.includes(c);
        return { codigo: c, destraba, profundidad, obligatoria, puntaje: destraba.length * 3 + profundidad * 2 + (obligatoria ? 2 : 0) };
      })
      .sort((a, b) => b.puntaje - a.puntaje || CATALOGO[a.codigo]!.horas - CATALOGO[b.codigo]!.horas);
  }, [plan, estados, dependientes, incluirOptativas, carrera]);

  // Regenera la recomendación automática cuando cambian los datos o la carga elegida
  useEffect(() => {
    setSeleccion(candidatas.slice(0, cantidad).map((c) => c.codigo));
  }, [candidatas, cantidad]);

  // Finales pendientes que más destraban: una materia regular no habilita lo que exige "aprobada"
  const finales = useMemo(
    () =>
      plan
        .filter((c) => (estados[c] ?? 'pendiente') === 'regular')
        .map((c) => ({ codigo: c, destraba: materiasQueDestraba(c, dependientes, estados) }))
        .filter((f) => f.destraba.length > 0)
        .sort((a, b) => b.destraba.length - a.destraba.length),
    [plan, estados, dependientes],
  );

  // Simulación: si aprobara todo lo seleccionado, ¿qué materias nuevas quedarían habilitadas?
  const seHabilitarian = useMemo(() => {
    const simulado = { ...estados };
    seleccion.forEach((c) => (simulado[c] = 'aprobada'));
    return plan.filter((c) => estadoAcademico(c, estados) === 'bloqueada' && estadoAcademico(c, simulado) === 'habilitada');
  }, [seleccion, estados, plan]);

  const horas = seleccion.reduce((t, c) => t + CATALOGO[c]!.horas, 0);
  const lider = candidatas[0];
  const maxPuntaje = Math.max(1, ...candidatas.map((c) => c.puntaje));

  const alternar = (codigo: string) =>
    setSeleccion((s) => (s.includes(codigo) ? s.filter((c) => c !== codigo) : [...s, codigo]));

  const copiarPlan = async () => {
    const texto = [
      `Nexo · Plan de cursada tentativo (${carrera.corto})`,
      ...seleccion.map((c, i) => `${i + 1}. ${c} · ${CATALOGO[c]!.nombre} (${CATALOGO[c]!.horas} h/sem)`),
      `Carga total: ${horas} h semanales`,
      seHabilitarian.length ? `Si aprobás todo, se habilitan: ${seHabilitarian.map(nombreCorto).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      onAvisar('Copiamos el plan al portapapeles.');
    } catch {
      onAvisar('No pudimos copiar automáticamente. Seleccioná el plan y copialo a mano.');
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-5" aria-label="Proyector de cursada">
      <div className="space-y-5 lg:col-span-3">
        {/* Preferencias */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800">¿Cuántas materias querés cursar el próximo cuatrimestre?</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Cantidad de materias">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={cantidad === n}
                  onClick={() => setCantidad(n)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${cantidad === n ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-800'} ${FOCO}`}
                  style={cantidad === n ? { color: MARCA.magenta } : undefined}
                >
                  {n} materias
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input id="incluir-optativas" type="checkbox" checked={incluirOptativas} onChange={(e) => setIncluirOptativas(e.target.checked)} className="h-4 w-4" style={{ accentColor: MARCA.magenta }} />
              Incluir optativas
            </label>
          </div>
        </div>

        {/* Alertas de ruta crítica */}
        {lider && lider.destraba.length >= 2 && (
          <div className="flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ background: MARCA.lavandaClaro, boxShadow: `inset 0 0 0 1px ${MARCA.lavanda}` }}>
            <Zap className="mt-0.5 h-5 w-5 shrink-0" style={{ color: MARCA.magenta }} aria-hidden />
            <p className="text-gray-700">
              <b style={{ color: MARCA.violetaOscuro }}>Ruta crítica:</b> te conviene cursar <b>{CATALOGO[lider.codigo]!.nombre}</b> porque destraba {plural(lider.destraba.length, 'materia', 'materias')}:{' '}
              {lider.destraba.map(nombreCorto).join(', ')}.
            </p>
          </div>
        )}
        {finales.map((f) => (
          <div key={f.codigo} className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden />
            <p>
              <b>Rendí el final de {CATALOGO[f.codigo]!.nombre}.</b> Ya la tenés regular y aprobarla libera {plural(f.destraba.length, 'materia', 'materias')} (
              {f.destraba.map(nombreCorto).join(', ')}).
            </p>
          </div>
        ))}

        {/* Ranking de materias habilitadas */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-base font-bold text-gray-800">Materias habilitadas, ordenadas por impacto</h3>
            <p className="mt-0.5 text-xs text-gray-500">Elegimos las primeras {cantidad}. Podés sumar o quitar materias del plan.</p>
          </div>
          {candidatas.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">No tenés materias habilitadas. Marcá en el mapa lo que ya cursaste para calcular tu próximo paso.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {candidatas.map((c, i) => {
                const m = CATALOGO[c.codigo]!;
                const elegida = seleccion.includes(c.codigo);
                return (
                  <li key={c.codigo} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="w-5 text-center text-sm font-bold tabular-nums text-gray-300">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-800">
                        {m.nombre}
                        {!c.obligatoria && <span className="rounded bg-gray-100 px-1.5 text-xs font-medium text-gray-500">Optativa</span>}
                        {i === 0 && c.destraba.length > 0 && (
                          <span className="rounded px-1.5 text-xs font-bold text-white" style={{ background: MARCA.magenta }}>
                            Ruta crítica
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {c.destraba.length > 0 ? `Destraba ${plural(c.destraba.length, 'materia', 'materias')}` : c.obligatoria ? 'Obligatoria sin dependientes: suma avance sin riesgo' : `Optativa de ${m.areas.join(' y ')}`}
                        {' · '}
                        {m.horas} h/sem
                      </p>
                      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${(c.puntaje / maxPuntaje) * 100}%`, background: GRADIENTE }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => alternar(c.codigo)}
                      aria-pressed={elegida}
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${elegida ? 'text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'} ${FOCO}`}
                      style={elegida ? { background: GRADIENTE } : undefined}
                    >
                      {elegida ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" aria-hidden /> En el plan
                        </span>
                      ) : (
                        'Sumar'
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Plan tentativo */}
      <aside className="space-y-5 lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:sticky lg:top-20">
          <div className="px-5 py-4 text-white" style={{ background: GRADIENTE_BANNER }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Plan tentativo · próximo cuatrimestre</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {plural(seleccion.length, 'materia', 'materias')} · {horas} h/sem
            </p>
          </div>
          <div className="p-5">
            {seleccion.length === 0 ? (
              <p className="text-sm text-gray-500">Sumá materias desde el ranking.</p>
            ) : (
              <ol className="space-y-2">
                {seleccion.map((c, i) => (
                  <li key={c} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: MARCA.magenta }}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-800">{CATALOGO[c]!.nombre}</span>
                      <span className="font-mono text-xs text-gray-400">{c}</span>
                    </span>
                    <button type="button" onClick={() => alternar(c)} className={`rounded p-1 text-gray-400 hover:text-gray-700 ${FOCO}`} aria-label={`Quitar ${CATALOGO[c]!.nombre}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {horas > 16 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> Más de 16 h semanales de cursada: considerá si podés sostenerlo junto con tus otras actividades.
              </p>
            )}

            {seHabilitarian.length > 0 && (
              <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: '#FDF2F8' }}>
                <p className="flex items-center gap-1 font-semibold" style={{ color: MARCA.magenta }}>
                  <Unlock className="h-3.5 w-3.5" aria-hidden /> Si aprobás este plan, se habilitan:
                </p>
                <p className="mt-1 text-gray-700">{seHabilitarian.map(nombreCorto).join(' · ')}</p>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={seleccion.length === 0}
                onClick={() => onGuardar(seleccion, horas)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 ${FOCO}`}
                style={{ background: GRADIENTE }}
              >
                <Save className="h-4 w-4" aria-hidden /> Guardar
              </button>
              <button
                type="button"
                disabled={seleccion.length === 0}
                onClick={copiarPlan}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 ${FOCO}`}
              >
                <ClipboardCopy className="h-4 w-4" aria-hidden /> Copiar plan
              </button>
            </div>
          </div>
        </div>

        {simulaciones.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h4 className="text-sm font-bold text-gray-800">Simulaciones guardadas</h4>
            <ul className="mt-3 space-y-2">
              {simulaciones.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-700">
                      {s.carrera} · {s.horas} h/sem
                    </p>
                    <p className="mt-0.5 text-gray-500">{s.materias.map(nombreCorto).join(' · ')}</p>
                    <p className="mt-0.5 text-gray-400">{s.fecha}</p>
                  </div>
                  <button type="button" onClick={() => onBorrarSimulacion(s.id)} className={`rounded p-1 text-gray-400 hover:text-gray-700 ${FOCO}`} aria-label="Borrar simulación">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista 3 · Recomendador vocacional de optativas
// ─────────────────────────────────────────────────────────────────────────────

function RecomendadorOptativas({ carrera, estados, onVerCompaneros }: { carrera: Carrera; estados: Record<string, EstadoAlumno>; onVerCompaneros: (codigo: string) => void }) {
  const [intereses, setIntereses] = useState<Pilar[]>(['Inteligencia Artificial', 'Análisis de Datos']);

  const alternar = (p: Pilar) => setIntereses((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));

  // Afinidad = pilares elegidos que cubre la optativa. A igual afinidad, primero lo que ya se puede cursar.
  const recomendadas = useMemo(() => {
    const orden: Record<EstadoAcademico, number> = { habilitada: 0, bloqueada: 1, regular: 2, aprobada: 3 };
    return carrera.optativas
      .map((c) => ({ codigo: c, coincidencias: CATALOGO[c]!.areas.filter((a) => intereses.includes(a)), estado: estadoAcademico(c, estados) }))
      .filter((o) => intereses.length === 0 || o.coincidencias.length > 0)
      .sort((a, b) => b.coincidencias.length - a.coincidencias.length || orden[a.estado] - orden[b.estado]);
  }, [carrera, estados, intereses]);

  const cursadas = carrera.optativas.filter((c) => ['regular', 'aprobada'].includes(estados[c] ?? 'pendiente')).length;

  return (
    <section className="space-y-6" aria-label="Recomendador de optativas">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-800">¿Hacia dónde querés orientar tu perfil?</h3>
            <p className="mt-0.5 text-sm text-gray-500">Elegí uno o más pilares. Cruzamos tus intereses con las correlativas que ya tenés.</p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-gray-600">
            Optativas cursadas: {cursadas}/{carrera.optativasRequeridas}
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PILARES.map((p) => {
            const activo = intereses.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(p.id)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${activo ? '' : 'border-gray-200 hover:bg-gray-50'} ${FOCO}`}
                style={activo ? { borderColor: MARCA.magenta, background: MARCA.lavandaClaro } : undefined}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${activo ? 'border-transparent text-white' : 'border-gray-300'}`}
                  style={activo ? { background: MARCA.magenta } : undefined}
                >
                  {activo && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span>
                  <span className="block text-sm font-semibold" style={{ color: activo ? MARCA.violetaOscuro : '#1F2937' }}>
                    {p.id}
                  </span>
                  <span className="block text-xs text-gray-500">{p.descripcion}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {recomendadas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Ninguna optativa de {carrera.corto} coincide con esos pilares. Probá sumando otro interés.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {recomendadas.map(({ codigo, coincidencias, estado }, i) => {
            const m = CATALOGO[codigo]!;
            const pasos = estado === 'bloqueada' ? caminoPrevio(codigo, estados) : [];
            const afinidad = intereses.length ? Math.round((coincidencias.length / m.areas.length) * 100) : 0;
            return (
              <article key={codigo} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-gray-400">{codigo}</p>
                    <h4 className="mt-0.5 font-bold leading-snug text-gray-800">{m.nombre}</h4>
                  </div>
                  <PildoraEstado estado={estado} />
                </div>
                <p className="mt-2 text-sm text-gray-600">{m.resumen}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {m.areas.map((a) => (
                    <span
                      key={a}
                      className={`rounded-lg px-2 py-0.5 text-xs font-medium ${coincidencias.includes(a) ? '' : 'bg-gray-100 text-gray-500'}`}
                      style={coincidencias.includes(a) ? { background: MARCA.lavanda, color: MARCA.violetaOscuro } : undefined}
                    >
                      {a}
                    </span>
                  ))}
                  {afinidad > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold" style={{ color: MARCA.magenta }}>
                      <Sparkles className="h-3.5 w-3.5" aria-hidden /> {i === 0 ? 'Mejor coincidencia' : `${afinidad}% afín`}
                    </span>
                  )}
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4 text-sm">
                  {estado === 'habilitada' && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-semibold" style={{ color: MARCA.magenta }}>
                        <Unlock className="h-4 w-4" aria-hidden /> Podés inscribirte este cuatrimestre
                      </p>
                      <button type="button" onClick={() => onVerCompaneros(codigo)} className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${FOCO}`} style={{ color: MARCA.violeta }}>
                        <Users className="h-3.5 w-3.5" aria-hidden /> Buscar compañeros ({cantidadFija(codigo)})
                      </button>
                    </div>
                  )}
                  {(estado === 'aprobada' || estado === 'regular') && (
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Ya la cursaste
                    </p>
                  )}
                  {estado === 'bloqueada' && (
                    <div>
                      <p className="font-semibold text-gray-700">Camino para habilitarla:</p>
                      <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {pasos.map((p, idx) => (
                          <React.Fragment key={p.codigo}>
                            <li className="rounded-lg bg-gray-100 px-2 py-1 text-gray-700">
                              {p.accion} <b>{nombreCorto(p.codigo)}</b>
                            </li>
                            {idx < pasos.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-gray-300" aria-hidden />}
                          </React.Fragment>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo complementario · compañeros que planifican una materia
// ─────────────────────────────────────────────────────────────────────────────

function ModalCompaneros({ codigo, onCerrar, onContactar }: { codigo: string | null; onCerrar: () => void; onContactar: (nombre: string) => void }) {
  useEffect(() => {
    if (!codigo) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [codigo, onCerrar]);

  if (!codigo) return null;
  const n = cantidadFija(codigo);
  const inicio = codigo.charCodeAt(codigo.length - 1) % COMPANEROS_MOCK.length;
  const lista = Array.from({ length: n }, (_, i) => COMPANEROS_MOCK[(inicio + i) % COMPANEROS_MOCK.length]!);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-companeros" className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="titulo-companeros" className="font-bold text-gray-800">
              Planificando {nombreCorto(codigo)}
            </h3>
            <p className="text-xs text-gray-500">{plural(n, 'estudiante tiene', 'estudiantes tienen')} esta materia en su plan del próximo cuatrimestre.</p>
          </div>
          <button type="button" onClick={onCerrar} className={`rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 ${FOCO}`} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="divide-y divide-gray-100 px-5">
          {lista.map((c) => (
            <li key={c.nombre} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold" style={{ background: MARCA.lavanda, color: MARCA.violetaOscuro }}>
                {c.iniciales}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{c.nombre}</p>
                <p className="text-xs text-gray-500">Prefiere turno {c.turno.toLowerCase()}</p>
              </div>
              <button type="button" onClick={() => onContactar(c.nombre)} className={`rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 ${FOCO}`}>
                Saludar
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-400">Sólo ves a quienes eligieron compartir su planificación.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente raíz
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE_SIMULACIONES = 'nexo-simulaciones';

export default function NexoPlanificador() {
  const [carreraId, setCarreraId] = useState<string>('ltd');
  const [vista, setVista] = useState<Vista>('mapa');
  const [estados, setEstados] = useState<Record<string, EstadoAlumno>>(ESTADO_INICIAL);
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [companerosDe, setCompanerosDe] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [simulaciones, setSimulaciones] = useState<Simulacion[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_SIMULACIONES) ?? '[]') as Simulacion[];
    } catch {
      return [];
    }
  });

  const carrera = CARRERAS.find((c) => c.id === carreraId)!;
  const plan = useMemo(() => [...carrera.obligatorias, ...carrera.optativas], [carrera]);
  const dependientes = useMemo(() => construirDependientes(plan), [plan]);

  // Estado académico de todo el plan: se recalcula al instante ante cualquier cambio
  const academico = useMemo(() => Object.fromEntries(plan.map((c) => [c, estadoAcademico(c, estados)])) as Record<string, EstadoAcademico>, [plan, estados]);

  // Materias marcadas como cursadas sin tener sus correlativas (p. ej. si se "desaprueba" una previa)
  const inconsistentes = useMemo(
    () => new Set(plan.filter((c) => (estados[c] ?? 'pendiente') !== 'pendiente' && requisitosFaltantes(c, estados).length > 0)),
    [plan, estados],
  );

  // Efecto cascada: detecta qué materias pasaron de Bloqueada a Habilitada con el último cambio
  const habilitadasPrevias = useRef<{ carrera: string; codigos: Set<string> } | null>(null);
  useEffect(() => {
    const actuales = new Set(plan.filter((c) => academico[c] === 'habilitada'));
    const previo = habilitadasPrevias.current;
    habilitadasPrevias.current = { carrera: carreraId, codigos: actuales };
    if (!previo || previo.carrera !== carreraId) return; // primer render o cambio de carrera: sin animación
    const nuevas = [...actuales].filter((c) => !previo.codigos.has(c));
    if (nuevas.length === 0) return;
    setRecientes(new Set(nuevas));
    setAviso(`${nuevas.length === 1 ? 'Se habilitó' : 'Se habilitaron'} ${nuevas.map(nombreCorto).join(', ')}.`);
    const t = window.setTimeout(() => setRecientes(new Set()), 2800);
    return () => window.clearTimeout(t);
  }, [academico, plan, carreraId]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 3800);
    return () => window.clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_SIMULACIONES, JSON.stringify(simulaciones));
    } catch {
      /* almacenamiento no disponible: las simulaciones viven sólo en memoria */
    }
  }, [simulaciones]);

  // ── Métricas de progreso ──────────────────────────────────────────────────
  const progreso = useMemo(() => {
    const aprobadas = plan.filter((c) => academico[c] === 'aprobada');
    const regulares = plan.filter((c) => academico[c] === 'regular');
    const habilitadas = plan.filter((c) => academico[c] === 'habilitada');
    // Créditos necesarios: todas las obligatorias + las optativas requeridas (tomando el crédito típico de una optativa)
    const creditoOptativa = CATALOGO[carrera.optativas[0]!]!.creditos;
    const total = carrera.obligatorias.reduce((t, c) => t + CATALOGO[c]!.creditos, 0) + carrera.optativasRequeridas * creditoOptativa;
    const optativasAprobadas = carrera.optativas.filter((c) => academico[c] === 'aprobada');
    const creditos =
      carrera.obligatorias.filter((c) => academico[c] === 'aprobada').reduce((t, c) => t + CATALOGO[c]!.creditos, 0) +
      optativasAprobadas.slice(0, carrera.optativasRequeridas).reduce((t, c) => t + CATALOGO[c]!.creditos, 0);
    return { aprobadas: aprobadas.length, regulares: regulares.length, habilitadas: habilitadas.length, creditos, total, porcentaje: Math.round((creditos / total) * 100) };
  }, [plan, academico, carrera]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const cambiarEstado = useCallback((codigo: string, estado: EstadoAlumno) => {
    setEstados((prev) => {
      const siguiente = { ...prev };
      if (estado === 'pendiente') delete siguiente[codigo];
      else siguiente[codigo] = estado;
      return siguiente;
    });
  }, []);

  const reiniciar = () => {
    setEstados(ESTADO_INICIAL);
    setAviso('Volviste al estado de ejemplo.');
  };

  const guardarSimulacion = (materias: string[], horas: number) => {
    setSimulaciones((s) => [
      { id: Date.now(), carrera: carrera.corto, materias, horas, fecha: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) },
      ...s,
    ].slice(0, 5));
    setAviso('Guardamos la simulación en este navegador.');
  };

  const cerrarCompaneros = useCallback(() => setCompanerosDe(null), []);

  const pestanas: { id: Vista; texto: string; Icono: React.ElementType }[] = [
    { id: 'mapa', texto: 'Mapa curricular', Icono: MapIcon },
    { id: 'proyector', texto: 'Proyector de cursada', Icono: Target },
    { id: 'optativas', texto: 'Optativas', Icono: Compass },
  ];

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 antialiased" style={{ fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif' }}>
      {/* Animación del efecto cascada */}
      <style>{`
        @keyframes nexoPop { 0% { transform: scale(.96); box-shadow: 0 0 0 0 rgba(176,36,131,.45); } 40% { transform: scale(1.03); } 100% { transform: scale(1); box-shadow: 0 0 0 14px rgba(176,36,131,0); } }
        .nexo-pop { animation: nexoPop .9s ease-out 2; }
        @media (prefers-reduced-motion: reduce) { .nexo-pop { animation: none; } }
      `}</style>

      <EncabezadoCampus pendientesRevision={inconsistentes.size} />

      {/* Banda institucional: migas de pan, carrera y progreso */}
      <div className="text-white" style={{ background: GRADIENTE_BANNER }}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-1 text-xs text-white/80">
            <span>Campus Virtual</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span>Vida Universitaria</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="font-semibold text-white">Nexo - Planificador de Carrera</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: 'Montserrat, Inter, system-ui, sans-serif' }}>
                Nexo · Planificador de Carrera
              </h1>
              <p className="mt-1 max-w-xl text-sm text-white/85">Marcá lo que ya cursaste y mirá qué se habilita, qué te conviene cursar y qué optativas van con tu perfil.</p>
            </div>
            <div className="inline-flex rounded-xl bg-white/15 p-1 backdrop-blur" role="radiogroup" aria-label="Carrera">
              {CARRERAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={carreraId === c.id}
                  onClick={() => setCarreraId(c.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${carreraId === c.id ? 'bg-white shadow-sm' : 'text-white/85 hover:text-white'} ${FOCO}`}
                  style={carreraId === c.id ? { color: MARCA.violetaOscuro } : undefined}
                >
                  Lic. en {c.corto}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de progreso de la carrera */}
          <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" aria-hidden />
                <span className="text-sm font-semibold">{carrera.nombre}</span>
              </div>
              <span className="text-3xl font-extrabold tabular-nums">{progreso.porcentaje}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={progreso.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la carrera">
              <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${progreso.porcentaje}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {[
                ['Aprobadas', progreso.aprobadas],
                ['Regulares', progreso.regulares],
                ['Habilitadas', progreso.habilitadas],
                ['Créditos', `${progreso.creditos}/${progreso.total}`],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-white/70">{k}</dt>
                  <dd className="text-lg font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Pestañas */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6" role="tablist" aria-label="Secciones de Nexo">
          {pestanas.map(({ id, texto, Icono }) => {
            const activa = vista === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setVista(id)}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-semibold transition ${activa ? '' : 'border-transparent text-gray-500 hover:text-gray-800'} ${FOCO}`}
                style={activa ? { borderColor: MARCA.magenta, color: MARCA.magenta } : undefined}
              >
                <Icono className="h-4 w-4" aria-hidden />
                {texto}
              </button>
            );
          })}
          <button type="button" onClick={reiniciar} className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 ${FOCO}`}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restablecer ejemplo
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        {carrera.nota && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {carrera.nota}
          </p>
        )}
        {inconsistentes.size > 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {plural(inconsistentes.size, 'materia figura cursada', 'materias figuran cursadas')} sin su correlativa: {[...inconsistentes].map(nombreCorto).join(', ')}.
          </p>
        )}

        {vista === 'mapa' && (
          <MapaCurricular
            carrera={carrera}
            estados={estados}
            dependientes={dependientes}
            recientes={recientes}
            inconsistentes={inconsistentes}
            onCambiarEstado={cambiarEstado}
            onVerCompaneros={setCompanerosDe}
          />
        )}
        {vista === 'proyector' && (
          <Proyector
            carrera={carrera}
            estados={estados}
            dependientes={dependientes}
            simulaciones={simulaciones}
            onGuardar={guardarSimulacion}
            onBorrarSimulacion={(id) => setSimulaciones((s) => s.filter((x) => x.id !== id))}
            onAvisar={setAviso}
          />
        )}
        {vista === 'optativas' && <RecomendadorOptativas carrera={carrera} estados={estados} onVerCompaneros={setCompanerosDe} />}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-gray-500 sm:px-6">
          <span>Universidad de la Ciudad · Escuela de Tecnologías e Industrias Digitales</span>
          <span>Nexo · prototipo MVP · horas y créditos de referencia</span>
        </div>
      </footer>

      <ModalCompaneros codigo={companerosDe} onCerrar={cerrarCompaneros} onContactar={(nombre) => setAviso(`Le mandamos tu saludo a ${nombre}.`)} />

      {aviso && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:left-auto sm:right-6">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" style={{ color: MARCA.magenta }} aria-hidden />
          <p className="flex-1 text-sm text-gray-700">{aviso}</p>
          <button type="button" onClick={() => setAviso(null)} className={`rounded-lg p-1 text-gray-400 hover:text-gray-700 ${FOCO}`} aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
