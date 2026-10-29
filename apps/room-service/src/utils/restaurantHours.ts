export interface OpeningHours {
  [key: string]: {
    is_closed: boolean;
    open_time: string;
    close_time: string;
    is_all_day?: boolean;
  };
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DAY_NAMES_SPANISH = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isRestaurantOpen(
  openingHours: OpeningHours | null | undefined,
): boolean {
  if (!openingHours) return true;

  const now = new Date();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = now.getDay();
  const todayHours = openingHours[DAY_NAMES[todayIndex]];

  if (todayHours && !todayHours.is_closed) {
    if (todayHours.is_all_day) return true;
    const openMin = toMinutes(todayHours.open_time);
    const closeMin = toMinutes(todayHours.close_time);
    if (closeMin > openMin) {
      if (currentTimeInMinutes >= openMin && currentTimeInMinutes < closeMin)
        return true;
    } else {
      // Overnight: cierra al día siguiente
      if (currentTimeInMinutes >= openMin) return true;
    }
  }

  // Verificar si ayer era nocturno y seguimos en su ventana de cierre
  const yesterdayIndex = (todayIndex + 6) % 7;
  const yesterdayHours = openingHours[DAY_NAMES[yesterdayIndex]];
  if (
    yesterdayHours &&
    !yesterdayHours.is_closed &&
    !yesterdayHours.is_all_day
  ) {
    const openMin = toMinutes(yesterdayHours.open_time);
    const closeMin = toMinutes(yesterdayHours.close_time);
    if (closeMin < openMin && currentTimeInMinutes < closeMin) return true;
  }

  return false;
}

// A que hora abren?
export function getNextOpeningTime(
  openingHours: OpeningHours | null | undefined,
): string {
  if (!openingHours) return "";

  const now = new Date();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  const currentDayIndex = now.getDay();

  const todayHours = openingHours[DAY_NAMES[currentDayIndex]];
  if (todayHours && !todayHours.is_closed && !todayHours.is_all_day) {
    const openMin = toMinutes(todayHours.open_time);
    if (currentTimeInMinutes < openMin)
      return `Abre hoy a las ${todayHours.open_time}`;
  }

  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (currentDayIndex + i) % 7;
    const nextDayHours = openingHours[DAY_NAMES[nextDayIndex]];
    if (nextDayHours && !nextDayHours.is_closed) {
      const dayLabel =
        i === 1 ? "mañana" : DAY_NAMES_SPANISH[nextDayIndex];
      if (nextDayHours.is_all_day) return `Abre ${dayLabel} (todo el día)`;
      return `Abre ${dayLabel} a las ${nextDayHours.open_time}`;
    }
  }

  return "Actualmente cerrado";
}
