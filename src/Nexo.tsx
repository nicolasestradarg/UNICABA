/**
 * Nexo — MVP para armar grupos de cursada
 * Universidad de la Ciudad (CABA) · Escuela de Tecnologías e Industrias Digitales (ETID)
 *
 * Componente único y autocontenido (React + TypeScript + Tailwind + lucide-react).
 * Toda la persistencia está simulada en memoria a través de `nexoApi`, una capa de
 * servicios pensada para reemplazarse por:
 *   - Moodle Web Services (REST): /webservice/rest/server.php?wsfunction=...&moodlewsrestformat=json
 *   - Lanzamiento embebido vía LTI 1.3 (el `sub` del id_token identifica al estudiante)
 *   - SIU Guaraní 3 (API REST) para sincronizar las materias en las que el estudiante está inscripto
 *
 * Nota de estilos: los colores institucionales (magenta/violeta) se aplican con `style`
 * para no depender de valores arbitrarios de Tailwind (no todos los entornos los compilan).
 * Los neutros y los estados usan la escala por defecto de Tailwind, que coincide con la guía.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  GraduationCap,
  Inbox,
  LayoutGrid,
  Laptop,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Identidad visual institucional
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

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de dominio
// ─────────────────────────────────────────────────────────────────────────────

type Modalidad = 'Virtual' | 'Híbrida' | 'Presencial';
type EstadoSolicitudGrupo = 'ninguna' | 'enviada' | 'miembro';
type EstadoSolicitud = 'pendiente' | 'aceptada' | 'rechazada';
type Vista = 'explorar' | 'perfil' | 'solicitudes';
type Orden = 'afinidad' | 'recientes' | 'cupo';

/** Materia tal como llega desde SIU Guaraní (inscripción a cursada). */
interface Materia {
  codigo: string;
  nombre: string;
  anio: number; // año del plan de estudios
  comision: string;
}

interface Persona {
  nombre: string;
  iniciales: string;
}

interface Grupo {
  id: string;
  nombre: string;
  materia: string; // código de materia
  cuatrimestre: string;
  miembros: number;
  cupo: number;
  habilidades: string[];
  modalidad: Modalidad;
  descripcion: string;
  autor: Persona;
  creado: string; // ISO 8601
  propio: boolean;
  estadoSolicitud: EstadoSolicitudGrupo;
}

interface Solicitud {
  id: string;
  tipo: 'recibida' | 'enviada';
  grupoId: string;
  persona: Persona; // en recibidas: quien postula; en enviadas: quien lidera el grupo
  habilidades: string[];
  mensaje: string;
  fecha: string; // ISO 8601
  estado: EstadoSolicitud;
}

interface Perfil {
  nombre: string;
  iniciales: string;
  legajo: string;
  carrera: string;
  cuatrimestre: string;
  anioCursada: number;
  email: string;
  habilidades: string[];
  disponible: boolean;
}

interface Aviso {
  id: number;
  texto: string;
  tipo: 'exito' | 'info' | 'alerta';
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos simulados (mock) — Licenciatura en Tecnologías Digitales
// ─────────────────────────────────────────────────────────────────────────────

const CUATRIMESTRE_ACTUAL = '2C 2026';

const MATERIAS: Materia[] = [
  { codigo: 'TGPD', nombre: 'Taller de Gestión de Proyectos Digitales', anio: 2, comision: 'Com. A · Mar 18 h' },
  { codigo: 'AD2', nombre: 'Análisis de Datos II', anio: 2, comision: 'Com. B · Jue 19 h' },
  { codigo: 'PWEB', nombre: 'Programación Web', anio: 2, comision: 'Com. A · Lun 18 h' },
  { codigo: 'BD', nombre: 'Bases de Datos', anio: 2, comision: 'Com. C · Mié 18 h' },
  { codigo: 'EYP', nombre: 'Estadística y Probabilidad', anio: 1, comision: 'Com. A · Vie 17 h' },
  { codigo: 'DUX', nombre: 'Diseño de Experiencia de Usuario', anio: 2, comision: 'Com. B · Mar 19 h' },
];

const CATALOGO_HABILIDADES: string[] = [
  'Python', 'SQL', 'Power BI', 'Excel', 'R', 'Tableau', 'Estadística',
  'Figma', 'UX Research', 'HTML/CSS', 'JavaScript', 'TypeScript', 'React', 'Node.js',
  'Git', 'SCRUM', 'Kanban', 'Jira', 'Documentación', 'Oratoria',
];

const MODALIDADES: Modalidad[] = ['Virtual', 'Híbrida', 'Presencial'];

/** Fechas relativas a "ahora" para que la demo siempre se vea reciente. */
const haceHoras = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

const PERFIL_INICIAL: Perfil = {
  nombre: 'Martina Sosa',
  iniciales: 'MS',
  legajo: '48.215',
  carrera: 'Licenciatura en Tecnologías Digitales',
  cuatrimestre: '4.º cuatrimestre',
  anioCursada: 2,
  email: 'martina.sosa@estudiantes.udelaciudad.edu.ar',
  habilidades: ['Python', 'SQL', 'Power BI', 'Excel', 'Git', 'Documentación'],
  disponible: true,
};

const GRUPOS_INICIALES: Grupo[] = [
  {
    id: 'g-databarrio',
    nombre: 'DataBarrio',
    materia: 'AD2',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 3,
    cupo: 5,
    habilidades: ['Python', 'Power BI', 'SQL', 'Estadística'],
    modalidad: 'Híbrida',
    descripcion:
      'Tablero con datos abiertos de BA Data sobre uso de Ecobici por comuna. Buscamos a alguien fuerte en limpieza de datos y otra persona para la presentación final.',
    autor: { nombre: 'Martina Sosa', iniciales: 'MS' },
    creado: haceHoras(30),
    propio: true,
    estadoSolicitud: 'ninguna',
  },
  {
    id: 'g-turnero',
    nombre: 'Turnero Salud Comunal',
    materia: 'PWEB',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 2,
    cupo: 4,
    habilidades: ['React', 'Node.js', 'Figma', 'Git'],
    modalidad: 'Virtual',
    descripcion:
      'App web para pedir turnos en un CeSAC ficticio. Ya tenemos el wireframe; falta front en React y una API simple en Node para el TP integrador.',
    autor: { nombre: 'Lucas Ferreyra', iniciales: 'LF' },
    creado: haceHoras(5),
    propio: false,
    estadoSolicitud: 'ninguna',
  },
  {
    id: 'g-scrum',
    nombre: 'Sprint Cero',
    materia: 'TGPD',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 4,
    cupo: 6,
    habilidades: ['SCRUM', 'Jira', 'Documentación', 'Oratoria'],
    modalidad: 'Presencial',
    descripcion:
      'Gestión del proyecto de digitalización de trámites de una cooperativa. Trabajamos con sprints de dos semanas y dailies antes de la clase del martes.',
    autor: { nombre: 'Agustina Molina', iniciales: 'AM' },
    creado: haceHoras(72),
    propio: false,
    estadoSolicitud: 'miembro',
  },
  {
    id: 'g-biblio',
    nombre: 'Modelo ER Biblioteca Popular',
    materia: 'BD',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 1,
    cupo: 3,
    habilidades: ['SQL', 'Git', 'Documentación'],
    modalidad: 'Virtual',
    descripcion:
      'Diseño del modelo entidad-relación y normalización hasta 3FN para el sistema de préstamos de una biblioteca popular de Boedo. Entrega en PostgreSQL.',
    autor: { nombre: 'Ezequiel Romero', iniciales: 'ER' },
    creado: haceHoras(12),
    propio: false,
    estadoSolicitud: 'ninguna',
  },
  {
    id: 'g-subte',
    nombre: 'Probabilistas del Subte',
    materia: 'EYP',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 3,
    cupo: 4,
    habilidades: ['R', 'Estadística', 'Excel'],
    modalidad: 'Híbrida',
    descripcion:
      'Modelamos las frecuencias de la línea B como proceso de Poisson y comparamos con los datos reales de molinetes. Nos falta una persona para la parte de simulación.',
    autor: { nombre: 'Camila Duarte', iniciales: 'CD' },
    creado: haceHoras(20),
    propio: false,
    estadoSolicitud: 'enviada',
  },
  {
    id: 'g-feria',
    nombre: 'Feria Digital Emprendedora',
    materia: 'TGPD',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 5,
    cupo: 5,
    habilidades: ['Figma', 'Kanban', 'Oratoria'],
    modalidad: 'Presencial',
    descripcion:
      'Organización de la feria de proyectos de fin de cuatrimestre de la ETID: cronograma, piezas de difusión y guion del pitch.',
    autor: { nombre: 'Nahuel Giménez', iniciales: 'NG' },
    creado: haceHoras(96),
    propio: false,
    estadoSolicitud: 'ninguna',
  },
  {
    id: 'g-dashboards',
    nombre: 'Tablero de Deserción',
    materia: 'AD2',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 2,
    cupo: 5,
    habilidades: ['Tableau', 'Python', 'Estadística'],
    modalidad: 'Virtual',
    descripcion:
      'Análisis exploratorio de un dataset anonimizado de trayectorias académicas para detectar patrones de abandono en primer año. Nos juntamos los sábados por Meet.',
    autor: { nombre: 'Florencia Acosta', iniciales: 'FA' },
    creado: haceHoras(3),
    propio: false,
    estadoSolicitud: 'ninguna',
  },
  {
    id: 'g-ux',
    nombre: 'Portfolio UX Colaborativo',
    materia: 'DUX',
    cuatrimestre: CUATRIMESTRE_ACTUAL,
    miembros: 1,
    cupo: 4,
    habilidades: ['Figma', 'UX Research', 'HTML/CSS'],
    modalidad: 'Híbrida',
    descripcion:
      'Rediseño de la experiencia de inscripción a materias: entrevistas a estudiantes, mapa de journey y prototipo navegable en Figma.',
    autor: { nombre: 'Julieta Paz', iniciales: 'JP' },
    creado: haceHoras(48),
    propio: false,
    estadoSolicitud: 'ninguna',
  },
];

const SOLICITUDES_INICIALES: Solicitud[] = [
  {
    id: 's-1',
    tipo: 'recibida',
    grupoId: 'g-databarrio',
    persona: { nombre: 'Tomás Herrera', iniciales: 'TH' },
    habilidades: ['Python', 'R', 'Estadística'],
    mensaje: '¡Hola! Curso AD II en la comisión del jueves. Me sumo para la limpieza de datos, ya trabajé con pandas en el TP anterior.',
    fecha: haceHoras(2),
    estado: 'pendiente',
  },
  {
    id: 's-2',
    tipo: 'recibida',
    grupoId: 'g-databarrio',
    persona: { nombre: 'Lucía Benítez', iniciales: 'LB' },
    habilidades: ['Power BI', 'Figma', 'Oratoria'],
    mensaje: 'Puedo encargarme del diseño del tablero y de la presentación. Tengo disponibilidad presencial los jueves.',
    fecha: haceHoras(9),
    estado: 'pendiente',
  },
  {
    id: 's-3',
    tipo: 'recibida',
    grupoId: 'g-databarrio',
    persona: { nombre: 'Joaquín Paz', iniciales: 'JP' },
    habilidades: ['SQL', 'Excel'],
    mensaje: 'Estoy recursando la materia y busco grupo. Me manejo bien con consultas SQL.',
    fecha: haceHoras(26),
    estado: 'pendiente',
  },
  {
    id: 's-4',
    tipo: 'enviada',
    grupoId: 'g-scrum',
    persona: { nombre: 'Agustina Molina', iniciales: 'AM' },
    habilidades: [],
    mensaje: 'Quiero sumarme como responsable de la documentación del proyecto.',
    fecha: haceHoras(70),
    estado: 'aceptada',
  },
  {
    id: 's-5',
    tipo: 'enviada',
    grupoId: 'g-subte',
    persona: { nombre: 'Camila Duarte', iniciales: 'CD' },
    habilidades: [],
    mensaje: 'Puedo hacer la simulación en Python si les sirve.',
    fecha: haceHoras(4),
    estado: 'pendiente',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Capa de integración (mock). Cada método documenta su equivalente real.
// ─────────────────────────────────────────────────────────────────────────────

const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

const nexoApi = {
  /** SIU Guaraní 3 → GET /alumnos/{legajo}/inscripciones/cursadas?periodo=2C-2026 */
  async sincronizarMaterias(): Promise<Materia[]> {
    await esperar(350);
    return MATERIAS;
  },
  /** Moodle → wsfunction=core_user_get_users_by_field + plugin local_nexo_get_profile */
  async obtenerPerfil(): Promise<Perfil> {
    await esperar(250);
    return PERFIL_INICIAL;
  },
  /** Moodle (plugin propio) → wsfunction=local_nexo_get_groups&periodo=2C-2026 */
  async obtenerGrupos(): Promise<Grupo[]> {
    await esperar(600);
    return GRUPOS_INICIALES;
  },
  /** Moodle (plugin propio) → wsfunction=local_nexo_get_requests */
  async obtenerSolicitudes(): Promise<Solicitud[]> {
    await esperar(450);
    return SOLICITUDES_INICIALES;
  },
  // Las escrituras (publicar, postular, aceptar) irían a local_nexo_create_group,
  // local_nexo_request_join y local_nexo_update_request; los avisos al otro estudiante,
  // a core_message_send_instant_messages. En el MVP se resuelven en el estado local.
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

const materiaPorCodigo = (codigo: string): Materia | undefined => MATERIAS.find((m) => m.codigo === codigo);

const iniciales = (nombre: string): string =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Texto relativo en castellano rioplatense ("hace 3 h", "hace 2 días"). */
function tiempoRelativo(iso: string): string {
  const minutos = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/** Porcentaje de habilidades del grupo que el estudiante ya tiene. */
function calcularAfinidad(grupo: Grupo, habilidades: string[]): number {
  if (grupo.habilidades.length === 0) return 0;
  const coincidencias = grupo.habilidades.filter((h) => habilidades.includes(h)).length;
  return Math.round((coincidencias / grupo.habilidades.length) * 100);
}

/** Color de avatar estable según el nombre (tonos suaves que conviven con la marca). */
const TONOS_AVATAR = [
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-indigo-100 text-indigo-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
];
function tonoAvatar(nombre: string): string {
  const suma = nombre.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return TONOS_AVATAR[suma % TONOS_AVATAR.length]!;
}

const ICONO_MODALIDAD: Record<Modalidad, React.ElementType> = {
  Virtual: Laptop,
  Híbrida: Shuffle,
  Presencial: Building2,
};

const ESTILO_MODALIDAD: Record<Modalidad, string> = {
  Virtual: 'bg-blue-50 text-blue-700 ring-blue-200',
  Híbrida: 'bg-amber-50 text-amber-700 ring-amber-200',
  Presencial: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const FOCO = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2';

// ─────────────────────────────────────────────────────────────────────────────
// Componentes de presentación
// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ persona, tamano = 'md', marca = false }: { persona: Persona; tamano?: 'sm' | 'md' | 'lg'; marca?: boolean }) {
  const medidas = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-20 w-20 text-2xl' }[tamano];
  if (marca) {
    return (
      <div className={`${medidas} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`} style={{ background: GRADIENTE }}>
        {persona.iniciales}
      </div>
    );
  }
  return (
    <div className={`${medidas} ${tonoAvatar(persona.nombre)} flex shrink-0 items-center justify-center rounded-full font-semibold`}>
      {persona.iniciales}
    </div>
  );
}

function BadgeHabilidad({ nombre, destacada = false }: { nombre: string; destacada?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium ${destacada ? '' : 'bg-gray-100 text-gray-600'}`}
      style={destacada ? { background: MARCA.lavanda, color: MARCA.violetaOscuro } : undefined}
    >
      {destacada && <Check className="h-3 w-3" aria-hidden />}
      {nombre}
    </span>
  );
}

function PildoraModalidad({ modalidad }: { modalidad: Modalidad }) {
  const Icono = ICONO_MODALIDAD[modalidad];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ESTILO_MODALIDAD[modalidad]}`}>
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {modalidad}
    </span>
  );
}

/** Encabezado que replica el Campus Virtual: isotipo, accesos, notificaciones, perfil y migas de pan. */
function EncabezadoCampus({
  perfil,
  pendientes,
  sincronizado,
  onIrSolicitudes,
  onIrPerfil,
}: {
  perfil: Perfil;
  pendientes: number;
  sincronizado: string | null;
  onIrSolicitudes: () => void;
  onIrPerfil: () => void;
}) {
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
            <span className="cursor-default hover:text-gray-900">Mis cursos</span>
            <span className="cursor-default hover:text-gray-900">Calendario</span>
            <span className="font-semibold" style={{ color: MARCA.magenta }}>
              Vida Universitaria
            </span>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onIrSolicitudes}
              className={`relative rounded-xl p-2 text-gray-600 transition hover:bg-gray-100 ${FOCO}`}
              aria-label={`Notificaciones: ${pendientes} solicitudes pendientes`}
            >
              <Bell className="h-5 w-5" />
              {pendientes > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 items-center justify-center rounded-full px-1 font-bold text-white" style={{ background: MARCA.magenta, minWidth: 20, fontSize: 10 }}>
                  {pendientes}
                </span>
              )}
            </button>
            <button type="button" onClick={onIrPerfil} className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-gray-100 ${FOCO}`}>
              <div className="relative">
                <Avatar persona={perfil} tamano="sm" marca />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${perfil.disponible ? 'bg-emerald-500' : 'bg-gray-400'}`}
                  aria-hidden
                />
              </div>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold text-gray-800">{perfil.nombre}</span>
                <span className="block text-xs text-gray-500">Estudiante · Legajo {perfil.legajo}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Banda institucional con migas de pan */}
      <div className="text-white" style={{ background: GRADIENTE_BANNER }}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-1 text-xs text-white/80">
            <span>Campus Virtual</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span>Vida Universitaria</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="font-semibold text-white">Nexo</span>
          </nav>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: 'Montserrat, Inter, system-ui, sans-serif' }}>
                Nexo
              </h1>
              <p className="mt-1 max-w-xl text-sm text-white/85">
                Encontrá compañeros para tus trabajos grupales de la ETID, según materia, modalidad y habilidades.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                <RefreshCw className={`h-3.5 w-3.5 ${sincronizado ? '' : 'animate-spin'}`} aria-hidden />
                {sincronizado ? `SIU Guaraní sincronizado ${sincronizado}` : 'Sincronizando materias…'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Sesión Moodle · LTI 1.3
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Tarjeta de convocatoria con cupo, habilidades, afinidad y botón de postulación. */
function TarjetaGrupo({
  grupo,
  misHabilidades,
  destacada,
  onSolicitar,
  onCancelar,
}: {
  grupo: Grupo;
  misHabilidades: string[];
  destacada: boolean;
  onSolicitar: (g: Grupo) => void;
  onCancelar: (g: Grupo) => void;
}) {
  const materia = materiaPorCodigo(grupo.materia);
  const afinidad = calcularAfinidad(grupo, misHabilidades);
  const lleno = grupo.miembros >= grupo.cupo;
  const libres = grupo.cupo - grupo.miembros;

  // Botón de acción según el estado de la relación estudiante ↔ grupo
  let accion: React.ReactNode;
  if (grupo.propio) {
    accion = (
      <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: MARCA.lavanda, color: MARCA.violeta, background: MARCA.lavandaClaro }}>
        <Star className="h-4 w-4" aria-hidden /> Tu convocatoria
      </span>
    );
  } else if (grupo.estadoSolicitud === 'miembro') {
    accion = (
      <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Ya sos parte
      </span>
    );
  } else if (grupo.estadoSolicitud === 'enviada') {
    accion = (
      <div className="flex w-full items-center gap-2">
        <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: MARCA.lavanda, color: MARCA.violetaOscuro }}>
          <Check className="h-4 w-4" aria-hidden /> Solicitud enviada
        </span>
        <button
          type="button"
          onClick={() => onCancelar(grupo)}
          className={`rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${FOCO}`}
          aria-label={`Cancelar solicitud a ${grupo.nombre}`}
          title="Cancelar solicitud"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  } else if (lleno) {
    accion = (
      <span className="inline-flex w-full items-center justify-center rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">
        Cupo completo
      </span>
    );
  } else {
    accion = (
      <button
        type="button"
        onClick={() => onSolicitar(grupo)}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95 ${FOCO}`}
        style={{ background: GRADIENTE }}
      >
        <Send className="h-4 w-4" aria-hidden /> Solicitar unirse
      </button>
    );
  }

  return (
    <article
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md ${destacada ? 'ring-2 ring-offset-2' : 'border-gray-200'}`}
      style={destacada ? ({ borderColor: MARCA.magenta, '--tw-ring-color': MARCA.magenta } as React.CSSProperties) : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <PildoraModalidad modalidad={grupo.modalidad} />
        {!grupo.propio && afinidad > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: MARCA.magenta }} title="Habilidades del grupo que ya tenés">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> {afinidad}% afín
          </span>
        )}
        {destacada && <span className="text-xs font-semibold" style={{ color: MARCA.magenta }}>Recién publicado</span>}
      </div>

      <h3 className="mt-3 text-lg font-bold leading-snug text-gray-800">{grupo.nombre}</h3>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{materia?.nombre ?? grupo.materia}</span>
        <span className="text-gray-300">·</span>
        <span className="shrink-0">{grupo.cuatrimestre}</span>
      </p>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-600">{grupo.descripcion}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {grupo.habilidades.map((h) => (
          <BadgeHabilidad key={h} nombre={h} destacada={!grupo.propio && misHabilidades.includes(h)} />
        ))}
      </div>

      {/* Cupo: barra segmentada, un segmento por lugar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 font-semibold text-gray-700">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {grupo.miembros}/{grupo.cupo} miembros
          </span>
          <span className={lleno ? 'text-gray-400' : libres === 1 ? 'font-semibold text-amber-600' : 'text-gray-500'}>
            {lleno ? 'Sin lugares' : libres === 1 ? 'Queda 1 lugar' : `${libres} lugares`}
          </span>
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {Array.from({ length: grupo.cupo }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < grupo.miembros ? '' : 'bg-gray-200'}`}
              style={i < grupo.miembros ? { background: lleno ? '#9CA3AF' : MARCA.magenta } : undefined}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
        <Avatar persona={grupo.autor} tamano="sm" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-gray-700">{grupo.propio ? 'Vos' : grupo.autor.nombre}</span> · {tiempoRelativo(grupo.creado)}
        </span>
      </div>

      <div className="mt-4">{accion}</div>
    </article>
  );
}

function TarjetaEsqueleto() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5">
      <div className="h-5 w-24 rounded-full bg-gray-100" />
      <div className="mt-4 h-5 w-3/4 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded bg-gray-100" />
        <div className="h-3 rounded bg-gray-100" />
        <div className="h-3 w-2/3 rounded bg-gray-100" />
      </div>
      <div className="mt-6 h-9 rounded-xl bg-gray-100" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista A · Explorador de grupos
// ─────────────────────────────────────────────────────────────────────────────

function Explorador({
  grupos,
  cargando,
  perfil,
  destacadoId,
  onSolicitar,
  onCancelar,
  onCrear,
}: {
  grupos: Grupo[];
  cargando: boolean;
  perfil: Perfil;
  destacadoId: string | null;
  onSolicitar: (g: Grupo) => void;
  onCancelar: (g: Grupo) => void;
  onCrear: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [materia, setMateria] = useState<string>('todas');
  const [modalidad, setModalidad] = useState<Modalidad | 'todas'>('todas');
  const [orden, setOrden] = useState<Orden>('afinidad');
  const [soloConCupo, setSoloConCupo] = useState(false);

  // Filtros reactivos + ordenamiento, recalculados sólo cuando cambian sus dependencias
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const resultado = grupos.filter((g) => {
      if (materia !== 'todas' && g.materia !== materia) return false;
      if (modalidad !== 'todas' && g.modalidad !== modalidad) return false;
      if (soloConCupo && g.miembros >= g.cupo) return false;
      if (!texto) return true;
      const nombreMateria = materiaPorCodigo(g.materia)?.nombre ?? '';
      return [g.nombre, g.descripcion, nombreMateria, ...g.habilidades].some((campo) => campo.toLowerCase().includes(texto));
    });
    const porOrden: Record<Orden, (a: Grupo, b: Grupo) => number> = {
      afinidad: (a, b) => calcularAfinidad(b, perfil.habilidades) - calcularAfinidad(a, perfil.habilidades),
      recientes: (a, b) => new Date(b.creado).getTime() - new Date(a.creado).getTime(),
      cupo: (a, b) => b.cupo - b.miembros - (a.cupo - a.miembros),
    };
    // El grupo recién publicado siempre aparece primero
    return [...resultado].sort((a, b) => (a.id === destacadoId ? -1 : b.id === destacadoId ? 1 : porOrden[orden](a, b)));
  }, [grupos, busqueda, materia, modalidad, soloConCupo, orden, perfil.habilidades, destacadoId]);

  const abiertos = grupos.filter((g) => g.miembros < g.cupo).length;
  const afines = grupos.filter((g) => !g.propio && calcularAfinidad(g, perfil.habilidades) >= 50).length;
  const hayFiltros = busqueda !== '' || materia !== 'todas' || modalidad !== 'todas' || soloConCupo;

  const limpiar = () => {
    setBusqueda('');
    setMateria('todas');
    setModalidad('todas');
    setSoloConCupo(false);
  };

  return (
    <section aria-labelledby="titulo-explorar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-explorar" className="text-xl font-bold text-gray-800">
            Grupos y convocatorias
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {grupos.length} convocatorias en {CUATRIMESTRE_ACTUAL} · {abiertos} con lugares libres · {afines} afines a tu perfil
          </p>
        </div>
        <button
          type="button"
          onClick={onCrear}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95 ${FOCO}`}
          style={{ background: GRADIENTE }}
        >
          <Plus className="h-4 w-4" aria-hidden /> Crear Nexo
        </button>
      </div>

      {!perfil.disponible && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Marcaste tu perfil como «Grupo completo»: otros estudiantes no te ven en sus búsquedas. Podés seguir explorando y postularte.
        </div>
      )}

      {/* Panel de filtros */}
      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-12">
          <label className="relative md:col-span-5">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              id="busqueda"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscá por nombre, habilidad o palabra clave"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 transition focus:border-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
          </label>
          <label className="md:col-span-4">
            <span className="sr-only">Materia</span>
            <select
              id="filtro-materia"
              value={materia}
              onChange={(e) => setMateria(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-100"
            >
              <option value="todas">Todas las materias</option>
              {MATERIAS.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-3">
            <span className="sr-only">Ordenar por</span>
            <select
              id="orden"
              value={orden}
              onChange={(e) => setOrden(e.target.value as Orden)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-purple-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-100"
            >
              <option value="afinidad">Ordenar: mayor afinidad</option>
              <option value="recientes">Ordenar: más recientes</option>
              <option value="cupo">Ordenar: más lugares libres</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modalidad">
            <SlidersHorizontal className="h-4 w-4 text-gray-400" aria-hidden />
            {(['todas', ...MODALIDADES] as const).map((m) => {
              const activa = modalidad === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModalidad(m)}
                  aria-pressed={activa}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${activa ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${FOCO}`}
                  style={activa ? { background: MARCA.lavanda, color: MARCA.violetaOscuro } : undefined}
                >
                  {m === 'todas' ? 'Todas' : m}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
              <input
                id="solo-cupo"
                type="checkbox"
                checked={soloConCupo}
                onChange={(e) => setSoloConCupo(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                style={{ accentColor: MARCA.magenta }}
              />
              Sólo con lugares libres
            </label>
            {hayFiltros && (
              <button type="button" onClick={limpiar} className={`text-xs font-semibold underline-offset-2 hover:underline ${FOCO}`} style={{ color: MARCA.magenta }}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Listado */}
      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cargando
          ? Array.from({ length: 6 }).map((_, i) => <TarjetaEsqueleto key={i} />)
          : filtrados.map((g) => (
              <TarjetaGrupo
                key={g.id}
                grupo={g}
                misHabilidades={perfil.habilidades}
                destacada={g.id === destacadoId}
                onSolicitar={onSolicitar}
                onCancelar={onCancelar}
              />
            ))}
      </div>

      {!cargando && filtrados.length === 0 && (
        <div className="mt-2 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Search className="mx-auto h-8 w-8 text-gray-300" aria-hidden />
          <p className="mt-3 font-semibold text-gray-700">No hay convocatorias con esos filtros</p>
          <p className="mt-1 text-sm text-gray-500">Probá con otra materia o publicá tu propia búsqueda de equipo.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={limpiar} className={`rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${FOCO}`}>
              Limpiar filtros
            </button>
            <button type="button" onClick={onCrear} className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${FOCO}`} style={{ background: GRADIENTE }}>
              Crear Nexo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista B · Publicar convocatoria (modal "Crear Nexo")
// ─────────────────────────────────────────────────────────────────────────────

interface FormularioNexo {
  nombre: string;
  materia: string;
  cuatrimestre: string;
  cupo: number;
  habilidades: string[];
  modalidad: Modalidad | '';
  descripcion: string;
}

type ErroresFormulario = Partial<Record<keyof FormularioNexo, string>>;

const FORMULARIO_VACIO: FormularioNexo = {
  nombre: '',
  materia: '',
  cuatrimestre: CUATRIMESTRE_ACTUAL,
  cupo: 4,
  habilidades: [],
  modalidad: '',
  descripcion: '',
};

const DESCRIPCION_MIN = 30;
const DESCRIPCION_MAX = 280;

function validarFormulario(f: FormularioNexo): ErroresFormulario {
  const errores: ErroresFormulario = {};
  if (f.nombre.trim().length < 4) errores.nombre = 'Poné un nombre de al menos 4 caracteres.';
  if (!f.materia) errores.materia = 'Elegí la materia de la convocatoria.';
  if (f.cupo < 2 || f.cupo > 8) errores.cupo = 'El grupo tiene que ser de 2 a 8 integrantes.';
  if (f.habilidades.length === 0) errores.habilidades = 'Agregá al menos una habilidad o rol que busques.';
  if (!f.modalidad) errores.modalidad = 'Elegí una modalidad de trabajo.';
  const largo = f.descripcion.trim().length;
  if (largo < DESCRIPCION_MIN) errores.descripcion = `Contá el objetivo en al menos ${DESCRIPCION_MIN} caracteres (llevás ${largo}).`;
  if (largo > DESCRIPCION_MAX) errores.descripcion = `La descripción supera los ${DESCRIPCION_MAX} caracteres.`;
  return errores;
}

function ModalCrearNexo({ abierto, materias, onCerrar, onPublicar }: { abierto: boolean; materias: Materia[]; onCerrar: () => void; onPublicar: (f: FormularioNexo) => void }) {
  const [form, setForm] = useState<FormularioNexo>(FORMULARIO_VACIO);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [habilidadNueva, setHabilidadNueva] = useState('');
  const primerCampo = useRef<HTMLInputElement>(null);

  // Al abrir: reinicia el formulario, enfoca el primer campo y habilita cerrar con Escape
  useEffect(() => {
    if (!abierto) return;
    setForm(FORMULARIO_VACIO);
    setErrores({});
    setIntentoEnvio(false);
    setHabilidadNueva('');
    const t = setTimeout(() => primerCampo.current?.focus(), 50);
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abierto, onCerrar]);

  // Revalida en vivo después del primer intento de envío
  useEffect(() => {
    if (intentoEnvio) setErrores(validarFormulario(form));
  }, [form, intentoEnvio]);

  if (!abierto) return null;

  const actualizar = <K extends keyof FormularioNexo>(campo: K, valor: FormularioNexo[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const alternarHabilidad = (h: string) =>
    actualizar('habilidades', form.habilidades.includes(h) ? form.habilidades.filter((x) => x !== h) : [...form.habilidades, h]);

  const agregarHabilidadPersonalizada = () => {
    const limpia = habilidadNueva.trim();
    if (!limpia) return;
    const existente = form.habilidades.find((h) => h.toLowerCase() === limpia.toLowerCase());
    if (!existente) actualizar('habilidades', [...form.habilidades, limpia]);
    setHabilidadNueva('');
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentoEnvio(true);
    const encontrados = validarFormulario(form);
    setErrores(encontrados);
    if (Object.keys(encontrados).length === 0) onPublicar(form);
  };

  const materiaElegida = materiaPorCodigo(form.materia);
  const sugeridas = Array.from(new Set([...CATALOGO_HABILIDADES, ...form.habilidades]));
  const largoDescripcion = form.descripcion.trim().length;

  const claseCampo = (error?: string) =>
    `w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 ${
      error ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-purple-300 focus:ring-purple-100'
    }`;

  const MensajeError = ({ texto }: { texto?: string }) =>
    texto ? (
      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {texto}
      </p>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-crear"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{ maxHeight: '92vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 id="titulo-crear" className="text-lg font-bold text-gray-800">
              Crear Nexo
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">Publicá una búsqueda de equipo. Va a aparecer en el explorador al instante.</p>
          </div>
          <button type="button" onClick={onCerrar} className={`rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 ${FOCO}`} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form id="form-crear" onSubmit={enviar} noValidate className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label htmlFor="nombre" className="text-sm font-semibold text-gray-700">
              Nombre del grupo o iniciativa
            </label>
            <input
              ref={primerCampo}
              id="nombre"
              value={form.nombre}
              onChange={(e) => actualizar('nombre', e.target.value)}
              placeholder="Ej.: Observatorio de Movilidad"
              maxLength={60}
              className={`mt-1.5 ${claseCampo(errores.nombre)}`}
            />
            <MensajeError texto={errores.nombre} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="materia" className="text-sm font-semibold text-gray-700">
                Materia
              </label>
              <select id="materia" value={form.materia} onChange={(e) => actualizar('materia', e.target.value)} className={`mt-1.5 ${claseCampo(errores.materia)}`}>
                <option value="">Elegí una materia…</option>
                {materias.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nombre}
                  </option>
                ))}
              </select>
              {materiaElegida && !errores.materia && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Tu inscripción en SIU Guaraní: {materiaElegida.comision}
                </p>
              )}
              <MensajeError texto={errores.materia} />
            </div>
            <div>
              <label htmlFor="cuatrimestre" className="text-sm font-semibold text-gray-700">
                Cuatrimestre
              </label>
              <select id="cuatrimestre" value={form.cuatrimestre} onChange={(e) => actualizar('cuatrimestre', e.target.value)} className={`mt-1.5 ${claseCampo()}`}>
                <option value="2C 2026">2C 2026</option>
                <option value="Verano 2027">Verano 2027</option>
                <option value="1C 2027">1C 2027</option>
              </select>
            </div>
          </div>

          <div>
            <span className="text-sm font-semibold text-gray-700">Integrantes en total (incluyéndote)</span>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="inline-flex items-center rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => actualizar('cupo', Math.max(2, form.cupo - 1))}
                  className={`px-3 py-2 text-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:text-gray-300 ${FOCO}`}
                  disabled={form.cupo <= 2}
                  aria-label="Restar un integrante"
                >
                  −
                </button>
                <input
                  id="cupo"
                  type="number"
                  min={2}
                  max={8}
                  value={form.cupo}
                  onChange={(e) => actualizar('cupo', Number(e.target.value))}
                  className="w-12 border-x border-gray-200 py-2 text-center text-sm font-semibold text-gray-800 focus:outline-none"
                  aria-label="Integrantes en total"
                />
                <button
                  type="button"
                  onClick={() => actualizar('cupo', Math.min(8, form.cupo + 1))}
                  className={`px-3 py-2 text-lg font-semibold text-gray-600 hover:bg-gray-50 disabled:text-gray-300 ${FOCO}`}
                  disabled={form.cupo >= 8}
                  aria-label="Sumar un integrante"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-gray-500">Buscás {Math.max(0, form.cupo - 1)} {form.cupo - 1 === 1 ? 'persona' : 'personas'} más</span>
            </div>
            <MensajeError texto={errores.cupo} />
          </div>

          <div>
            <span className="text-sm font-semibold text-gray-700">Habilidades o roles que buscás</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugeridas.map((h) => {
                const activa = form.habilidades.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => alternarHabilidad(h)}
                    aria-pressed={activa}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${activa ? 'shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${FOCO}`}
                    style={activa ? { background: MARCA.lavanda, color: MARCA.violetaOscuro } : undefined}
                  >
                    {activa ? <Check className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                    {h}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                id="habilidad-nueva"
                value={habilidadNueva}
                onChange={(e) => setHabilidadNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarHabilidadPersonalizada();
                  }
                }}
                placeholder="Otra habilidad o rol (Enter para agregar)"
                maxLength={30}
                className={claseCampo()}
              />
              <button type="button" onClick={agregarHabilidadPersonalizada} className={`shrink-0 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${FOCO}`}>
                Agregar
              </button>
            </div>
            <MensajeError texto={errores.habilidades} />
          </div>

          <div>
            <span className="text-sm font-semibold text-gray-700">Modalidad de trabajo</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Modalidad de trabajo">
              {MODALIDADES.map((m) => {
                const Icono = ICONO_MODALIDAD[m];
                const activa = form.modalidad === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => actualizar('modalidad', m)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-semibold transition ${activa ? '' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} ${FOCO}`}
                    style={activa ? { borderColor: MARCA.magenta, background: MARCA.lavandaClaro, color: MARCA.violetaOscuro } : undefined}
                  >
                    <Icono className="h-5 w-5" aria-hidden />
                    {m}
                  </button>
                );
              })}
            </div>
            <MensajeError texto={errores.modalidad} />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="descripcion" className="text-sm font-semibold text-gray-700">
                Objetivo del grupo
              </label>
              <span className={`text-xs tabular-nums ${largoDescripcion > DESCRIPCION_MAX ? 'text-red-600' : 'text-gray-400'}`}>
                {largoDescripcion}/{DESCRIPCION_MAX}
              </span>
            </div>
            <textarea
              id="descripcion"
              rows={3}
              value={form.descripcion}
              onChange={(e) => actualizar('descripcion', e.target.value)}
              placeholder="Qué van a hacer, qué entrega tienen y qué necesitan de quien se sume."
              className={`mt-1.5 resize-none ${claseCampo(errores.descripcion)}`}
            />
            <MensajeError texto={errores.descripcion} />
          </div>
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onCerrar} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 ${FOCO}`}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-crear"
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95 ${FOCO}`}
            style={{ background: GRADIENTE }}
          >
            <Send className="h-4 w-4" aria-hidden /> Publicar grupo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista C · Mi perfil académico
// ─────────────────────────────────────────────────────────────────────────────

function MiPerfil({
  perfil,
  grupos,
  solicitudes,
  onActualizarPerfil,
  onCancelar,
}: {
  perfil: Perfil;
  grupos: Grupo[];
  solicitudes: Solicitud[];
  onActualizarPerfil: (cambios: Partial<Perfil>) => void;
  onCancelar: (g: Grupo) => void;
}) {
  const [pestana, setPestana] = useState<'grupos' | 'enviadas'>('grupos');
  const [nueva, setNueva] = useState('');

  const misGrupos = grupos.filter((g) => g.propio || g.estadoSolicitud === 'miembro');
  const enviadas = solicitudes.filter((s) => s.tipo === 'enviada');

  const quitar = (h: string) => onActualizarPerfil({ habilidades: perfil.habilidades.filter((x) => x !== h) });
  const agregar = (h: string) => {
    const limpia = h.trim();
    if (!limpia || perfil.habilidades.some((x) => x.toLowerCase() === limpia.toLowerCase())) return;
    onActualizarPerfil({ habilidades: [...perfil.habilidades, limpia] });
  };
  const disponiblesParaAgregar = CATALOGO_HABILIDADES.filter((h) => !perfil.habilidades.includes(h));

  return (
    <section className="grid gap-6 lg:grid-cols-3" aria-label="Mi perfil académico">
      {/* Ficha del estudiante */}
      <div className="space-y-6 lg:col-span-1">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="h-20" style={{ background: GRADIENTE_BANNER }} />
          <div className="-mt-10 px-5 pb-5">
            <div className="rounded-full border-4 border-white" style={{ width: 'fit-content' }}>
              <Avatar persona={perfil} tamano="lg" marca />
            </div>
            <h2 className="mt-3 text-xl font-bold text-gray-800">{perfil.nombre}</h2>
            <p className="text-sm font-medium" style={{ color: MARCA.magenta }}>
              {perfil.carrera}
            </p>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <GraduationCap className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">Cursada</dt>
                <dd>
                  {perfil.cuatrimestre} · {perfil.anioCursada}.º año · ETID
                </dd>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <User className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">Legajo</dt>
                <dd>Legajo {perfil.legajo}</dd>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">Correo institucional</dt>
                <dd className="min-w-0 break-all">{perfil.email}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Toggle de disponibilidad */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{perfil.disponible ? 'Disponible para armar grupo' : 'Grupo completo'}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {perfil.disponible ? 'Aparecés en las búsquedas de otros estudiantes.' : 'No aparecés en búsquedas ni recibís invitaciones nuevas.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={perfil.disponible}
              aria-label="Disponible para armar grupo"
              onClick={() => onActualizarPerfil({ disponible: !perfil.disponible })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${perfil.disponible ? 'bg-emerald-500' : 'bg-gray-300'} ${FOCO}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${perfil.disponible ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Gestor de habilidades */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Tag className="h-4 w-4 text-gray-400" aria-hidden /> Mis habilidades
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">Se usan para calcular tu afinidad con cada grupo.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {perfil.habilidades.length === 0 && <p className="text-xs text-gray-400">Todavía no agregaste habilidades.</p>}
            {perfil.habilidades.map((h) => (
              <span key={h} className="inline-flex items-center gap-1 rounded-lg py-0.5 pl-2 pr-1 text-xs font-medium" style={{ background: MARCA.lavanda, color: MARCA.violetaOscuro }}>
                {h}
                <button type="button" onClick={() => quitar(h)} className={`rounded p-0.5 hover:bg-white/60 ${FOCO}`} aria-label={`Quitar ${h}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              id="habilidad-perfil"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  agregar(nueva);
                  setNueva('');
                }
              }}
              placeholder="Agregar habilidad"
              maxLength={30}
              list="catalogo-habilidades"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
            <datalist id="catalogo-habilidades">
              {disponiblesParaAgregar.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => {
                agregar(nueva);
                setNueva('');
              }}
              className={`shrink-0 rounded-xl px-3 text-white ${FOCO}`}
              style={{ background: GRADIENTE }}
              aria-label="Agregar habilidad"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {disponiblesParaAgregar.slice(0, 8).map((h) => (
              <button key={h} type="button" onClick={() => agregar(h)} className={`rounded-lg border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 ${FOCO}`}>
                + {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pestañas secundarias */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex gap-1 border-b border-gray-100 px-3 pt-3" role="tablist">
            {(
              [
                ['grupos', 'Mis grupos actuales', misGrupos.length],
                ['enviadas', 'Solicitudes enviadas', enviadas.length],
              ] as const
            ).map(([id, texto, cantidad]) => {
              const activa = pestana === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setPestana(id)}
                  className={`-mb-px border-b-2 px-3 pb-3 text-sm font-semibold transition ${activa ? '' : 'border-transparent text-gray-500 hover:text-gray-800'} ${FOCO}`}
                  style={activa ? { borderColor: MARCA.magenta, color: MARCA.magenta } : undefined}
                >
                  {texto} <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{cantidad}</span>
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {pestana === 'grupos' ? (
              <ul className="space-y-3">
                {misGrupos.length === 0 && <li className="py-8 text-center text-sm text-gray-500">Todavía no formás parte de ningún grupo este cuatrimestre.</li>}
                {misGrupos.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-4 transition hover:shadow-sm">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: MARCA.lavanda, color: MARCA.violeta }}>
                      <Users className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800">{g.nombre}</p>
                      <p className="truncate text-sm text-gray-500">
                        {materiaPorCodigo(g.materia)?.nombre} · {g.cuatrimestre}
                      </p>
                    </div>
                    <PildoraModalidad modalidad={g.modalidad} />
                    <span className="text-sm font-semibold tabular-nums text-gray-700">
                      {g.miembros}/{g.cupo}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.propio ? '' : 'bg-emerald-50 text-emerald-700'}`} style={g.propio ? { background: MARCA.lavanda, color: MARCA.violetaOscuro } : undefined}>
                      {g.propio ? 'Coordinás' : 'Integrante'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ListaEnviadas solicitudes={enviadas} grupos={grupos} onCancelar={onCancelar} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const ESTILO_ESTADO: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-700' },
  aceptada: { texto: 'Aceptada', clase: 'bg-emerald-50 text-emerald-700' },
  rechazada: { texto: 'Rechazada', clase: 'bg-gray-100 text-gray-500' },
};

function ListaEnviadas({ solicitudes, grupos, onCancelar }: { solicitudes: Solicitud[]; grupos: Grupo[]; onCancelar: (g: Grupo) => void }) {
  if (solicitudes.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No enviaste solicitudes todavía. Buscá un grupo en el explorador.</p>;
  }
  return (
    <ul className="space-y-3">
      {solicitudes.map((s) => {
        const grupo = grupos.find((g) => g.id === s.grupoId);
        const estado = ESTILO_ESTADO[s.estado];
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-4">
            <Avatar persona={s.persona} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-800">{grupo?.nombre ?? 'Grupo eliminado'}</p>
              <p className="truncate text-sm text-gray-500">
                Coordina {s.persona.nombre} · {tiempoRelativo(s.fecha)}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>
            {s.estado === 'pendiente' && grupo && (
              <button type="button" onClick={() => onCancelar(grupo)} className={`text-xs font-semibold text-gray-500 hover:text-gray-800 ${FOCO}`}>
                Cancelar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista D · Bandeja de solicitudes y conexiones
// ─────────────────────────────────────────────────────────────────────────────

function BandejaSolicitudes({
  solicitudes,
  grupos,
  onResponder,
  onCoordinar,
  onCancelar,
}: {
  solicitudes: Solicitud[];
  grupos: Grupo[];
  onResponder: (s: Solicitud, estado: 'aceptada' | 'rechazada') => void;
  onCoordinar: (s: Solicitud) => void;
  onCancelar: (g: Grupo) => void;
}) {
  const [bandeja, setBandeja] = useState<'recibidas' | 'enviadas'>('recibidas');
  const recibidas = solicitudes.filter((s) => s.tipo === 'recibida');
  const enviadas = solicitudes.filter((s) => s.tipo === 'enviada');
  const pendientes = recibidas.filter((s) => s.estado === 'pendiente').length;

  return (
    <section aria-labelledby="titulo-bandeja">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="titulo-bandeja" className="text-xl font-bold text-gray-800">
            Solicitudes y conexiones
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {pendientes > 0 ? `Tenés ${pendientes} ${pendientes === 1 ? 'solicitud' : 'solicitudes'} por responder.` : 'Estás al día con tus solicitudes.'}
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1" role="tablist">
          {(
            [
              ['recibidas', `Recibidas (${recibidas.length})`],
              ['enviadas', `Enviadas (${enviadas.length})`],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={bandeja === id}
              onClick={() => setBandeja(id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${bandeja === id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'} ${FOCO}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {bandeja === 'enviadas' ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <ListaEnviadas solicitudes={enviadas} grupos={grupos} onCancelar={onCancelar} />
          </div>
        ) : recibidas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <Inbox className="mx-auto h-8 w-8 text-gray-300" aria-hidden />
            <p className="mt-3 font-semibold text-gray-700">No recibiste solicitudes</p>
            <p className="mt-1 text-sm text-gray-500">Cuando alguien quiera sumarse a tus grupos, lo vas a ver acá.</p>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {recibidas.map((s) => {
              const grupo = grupos.find((g) => g.id === s.grupoId);
              const estado = ESTILO_ESTADO[s.estado];
              const lleno = grupo ? grupo.miembros >= grupo.cupo : false;
              return (
                <li key={s.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${s.estado === 'pendiente' ? 'border-gray-200 hover:shadow-md' : 'border-gray-100 opacity-90'}`}>
                  <div className="flex items-start gap-3">
                    <Avatar persona={s.persona} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-800">{s.persona.nombre}</p>
                      <p className="text-xs text-gray-500">
                        Quiere sumarse a <span className="font-semibold text-gray-700">{grupo?.nombre}</span> · {tiempoRelativo(s.fecha)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>
                  </div>
                  <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-600">«{s.mensaje}»</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.habilidades.map((h) => (
                      <BadgeHabilidad key={h} nombre={h} destacada={grupo?.habilidades.includes(h)} />
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    {s.estado === 'pendiente' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onResponder(s, 'aceptada')}
                          disabled={lleno}
                          title={lleno ? 'Tu grupo ya no tiene lugares libres' : undefined}
                          className={`inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 ${FOCO}`}
                        >
                          <Check className="h-4 w-4" aria-hidden /> Aceptar
                        </button>
                        <button
                          type="button"
                          onClick={() => onResponder(s, 'rechazada')}
                          className={`inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 ${FOCO}`}
                        >
                          <X className="h-4 w-4" aria-hidden /> Rechazar
                        </button>
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> Respondida
                      </span>
                    )}
                    {s.estado !== 'rechazada' && (
                      <a
                        href="https://meet.google.com/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onCoordinar(s)}
                        className={`ml-auto inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:brightness-95 ${FOCO}`}
                        style={{ background: MARCA.lavanda, color: MARCA.violetaOscuro }}
                      >
                        <Video className="h-4 w-4" aria-hidden /> Coordinar por Meet
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente raíz
// ─────────────────────────────────────────────────────────────────────────────

export default function Nexo() {
  const [vista, setVista] = useState<Vista>('explorar');
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_INICIAL);
  const [materias, setMaterias] = useState<Materia[]>(MATERIAS);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizadoEn, setSincronizadoEn] = useState<number | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [destacadoId, setDestacadoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [, setReloj] = useState(0);
  const temporizadores = useRef<number[]>([]);

  // Carga inicial desde la capa de integración (Moodle + SIU Guaraní simulados)
  useEffect(() => {
    let activo = true;
    Promise.all([nexoApi.sincronizarMaterias(), nexoApi.obtenerPerfil(), nexoApi.obtenerGrupos(), nexoApi.obtenerSolicitudes()]).then(([m, p, g, s]) => {
      if (!activo) return;
      setMaterias(m);
      setPerfil(p);
      setGrupos(g);
      setSolicitudes(s);
      setCargando(false);
      setSincronizadoEn(Date.now());
    });
    return () => {
      activo = false;
    };
  }, []);

  // Refresca los textos relativos ("hace 3 min") cada minuto
  useEffect(() => {
    const id = window.setInterval(() => setReloj((r) => r + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Oculta el aviso flotante después de unos segundos
  useEffect(() => {
    if (!aviso) return;
    const id = window.setTimeout(() => setAviso(null), 3800);
    return () => window.clearTimeout(id);
  }, [aviso]);

  // Quita el resaltado de la tarjeta recién publicada
  useEffect(() => {
    if (!destacadoId) return;
    const id = window.setTimeout(() => setDestacadoId(null), 8000);
    return () => window.clearTimeout(id);
  }, [destacadoId]);

  // Limpia respuestas simuladas pendientes al desmontar
  useEffect(() => () => temporizadores.current.forEach((t) => window.clearTimeout(t)), []);

  const avisar = (texto: string, tipo: Aviso['tipo'] = 'exito') => setAviso({ id: Date.now(), texto, tipo });

  const pendientesRecibidas = solicitudes.filter((s) => s.tipo === 'recibida' && s.estado === 'pendiente').length;

  const textoSincronizado = useMemo(() => {
    if (!sincronizadoEn) return null;
    return tiempoRelativo(new Date(sincronizadoEn).toISOString());
    // `grupos` se incluye para refrescar el texto ante cada cambio de datos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sincronizadoEn, grupos]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const solicitarUnirse = (grupo: Grupo) => {
    setGrupos((gs) => gs.map((g) => (g.id === grupo.id ? { ...g, estadoSolicitud: 'enviada' } : g)));
    const nueva: Solicitud = {
      id: `s-${Date.now()}`,
      tipo: 'enviada',
      grupoId: grupo.id,
      persona: grupo.autor,
      habilidades: perfil.habilidades,
      mensaje: `Hola, soy ${perfil.nombre.split(' ')[0]} y me interesa sumarme a ${grupo.nombre}.`,
      fecha: new Date().toISOString(),
      estado: 'pendiente',
    };
    setSolicitudes((ss) => [nueva, ...ss]);
    avisar(`Solicitud enviada a ${grupo.autor.nombre}. Te avisamos cuando responda.`);

    // Simulación: si al grupo le sobran lugares, quien lo coordina acepta a los pocos segundos
    if (grupo.cupo - grupo.miembros >= 2) {
      const t = window.setTimeout(() => {
        setSolicitudes((ss) => ss.map((s) => (s.id === nueva.id && s.estado === 'pendiente' ? { ...s, estado: 'aceptada' } : s)));
        setGrupos((gs) =>
          gs.map((g) => (g.id === grupo.id && g.estadoSolicitud === 'enviada' ? { ...g, estadoSolicitud: 'miembro', miembros: Math.min(g.cupo, g.miembros + 1) } : g)),
        );
        avisar(`${grupo.autor.nombre} aceptó tu solicitud a ${grupo.nombre}.`, 'info');
      }, 7000);
      temporizadores.current.push(t);
    }
  };

  const cancelarSolicitud = (grupo: Grupo) => {
    setGrupos((gs) => gs.map((g) => (g.id === grupo.id ? { ...g, estadoSolicitud: 'ninguna' } : g)));
    setSolicitudes((ss) => ss.filter((s) => !(s.tipo === 'enviada' && s.grupoId === grupo.id && s.estado === 'pendiente')));
    avisar(`Cancelaste tu solicitud a ${grupo.nombre}.`, 'alerta');
  };

  const responderSolicitud = (solicitud: Solicitud, estado: 'aceptada' | 'rechazada') => {
    const grupo = grupos.find((g) => g.id === solicitud.grupoId);
    if (estado === 'aceptada' && grupo && grupo.miembros >= grupo.cupo) {
      avisar(`${grupo.nombre} ya no tiene lugares libres.`, 'alerta');
      return;
    }
    setSolicitudes((ss) => ss.map((s) => (s.id === solicitud.id ? { ...s, estado } : s)));
    if (estado === 'aceptada') {
      setGrupos((gs) => gs.map((g) => (g.id === solicitud.grupoId ? { ...g, miembros: g.miembros + 1 } : g)));
      avisar(`${solicitud.persona.nombre} ahora es parte de ${grupo?.nombre}.`);
    } else {
      avisar(`Rechazaste la solicitud de ${solicitud.persona.nombre}.`, 'alerta');
    }
  };

  const coordinarPorMeet = (solicitud: Solicitud) => avisar(`Abrimos Google Meet en otra pestaña. Compartí el enlace con ${solicitud.persona.nombre.split(' ')[0]}.`, 'info');

  const publicarGrupo = (f: FormularioNexo) => {
    const nuevo: Grupo = {
      id: `g-${Date.now()}`,
      nombre: f.nombre.trim(),
      materia: f.materia,
      cuatrimestre: f.cuatrimestre,
      miembros: 1,
      cupo: f.cupo,
      habilidades: f.habilidades,
      modalidad: f.modalidad as Modalidad,
      descripcion: f.descripcion.trim(),
      autor: { nombre: perfil.nombre, iniciales: iniciales(perfil.nombre) },
      creado: new Date().toISOString(),
      propio: true,
      estadoSolicitud: 'ninguna',
    };
    setGrupos((gs) => [nuevo, ...gs]);
    setDestacadoId(nuevo.id);
    setModalAbierto(false);
    setVista('explorar');
    avisar(`Publicaste «${nuevo.nombre}». Ya aparece en el explorador.`);
  };

  const actualizarPerfil = (cambios: Partial<Perfil>) => {
    setPerfil((p) => ({ ...p, ...cambios }));
    if (cambios.disponible !== undefined) avisar(cambios.disponible ? 'Estás visible como disponible para armar grupo.' : 'Marcaste tu perfil como «Grupo completo».', 'info');
  };

  const abrirModal = () => setModalAbierto(true);
  const cerrarModal = useCallback(() => setModalAbierto(false), []);

  // ── Navegación principal ─────────────────────────────────────────────────

  const pestanas: { id: Vista; texto: string; Icono: React.ElementType; contador?: number }[] = [
    { id: 'explorar', texto: 'Explorar grupos', Icono: LayoutGrid },
    { id: 'perfil', texto: 'Mi perfil', Icono: User },
    { id: 'solicitudes', texto: 'Solicitudes', Icono: Inbox, contador: pendientesRecibidas },
  ];

  const estiloAviso: Record<Aviso['tipo'], { Icono: React.ElementType; clase: string }> = {
    exito: { Icono: CheckCircle2, clase: 'text-emerald-500' },
    info: { Icono: Bell, clase: 'text-blue-500' },
    alerta: { Icono: AlertCircle, clase: 'text-amber-500' },
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 antialiased" style={{ fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif' }}>
      <EncabezadoCampus
        perfil={perfil}
        pendientes={pendientesRecibidas}
        sincronizado={textoSincronizado}
        onIrSolicitudes={() => setVista('solicitudes')}
        onIrPerfil={() => setVista('perfil')}
      />

      {/* Barra de pestañas */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6" role="tablist" aria-label="Secciones de Nexo">
          {pestanas.map(({ id, texto, Icono, contador }) => {
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
                {!!contador && (
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: MARCA.magenta }}>
                    {contador}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={abrirModal}
            className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition hover:brightness-95 ${FOCO}`}
            style={{ background: MARCA.lavanda, color: MARCA.violetaOscuro }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Crear Nexo
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {vista === 'explorar' && (
          <Explorador
            grupos={grupos}
            cargando={cargando}
            perfil={perfil}
            destacadoId={destacadoId}
            onSolicitar={solicitarUnirse}
            onCancelar={cancelarSolicitud}
            onCrear={abrirModal}
          />
        )}
        {vista === 'perfil' && <MiPerfil perfil={perfil} grupos={grupos} solicitudes={solicitudes} onActualizarPerfil={actualizarPerfil} onCancelar={cancelarSolicitud} />}
        {vista === 'solicitudes' && (
          <BandejaSolicitudes solicitudes={solicitudes} grupos={grupos} onResponder={responderSolicitud} onCoordinar={coordinarPorMeet} onCancelar={cancelarSolicitud} />
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-gray-500 sm:px-6">
          <span>Universidad de la Ciudad · Escuela de Tecnologías e Industrias Digitales</span>
          <span>Nexo · prototipo MVP con datos simulados</span>
        </div>
      </footer>

      <ModalCrearNexo abierto={modalAbierto} materias={materias} onCerrar={cerrarModal} onPublicar={publicarGrupo} />

      {/* Aviso flotante (toast) */}
      {aviso && (
        <div key={aviso.id} role="status" aria-live="polite" className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg sm:left-auto sm:right-6">
          {(() => {
            const { Icono, clase } = estiloAviso[aviso.tipo];
            return <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${clase}`} aria-hidden />;
          })()}
          <p className="flex-1 text-sm text-gray-700">{aviso.texto}</p>
          <button type="button" onClick={() => setAviso(null)} className={`rounded-lg p-1 text-gray-400 hover:text-gray-700 ${FOCO}`} aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
