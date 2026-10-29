// Perfil completo = tiene nombre Y fecha de nacimiento. Se usa para evitar
// que un usuario autenticado con perfil vacío/incompleto llegue a ordenar
// bajo un nombre genérico/placeholder.
export interface ProfileCompletenessCheck {
  firstName?: string;
  birthDate?: string;
}

export const isProfileComplete = (
  profile?: ProfileCompletenessCheck | null,
): boolean => !!profile?.firstName && !!profile?.birthDate;

// Deriva una edad aproximada a partir de la fecha de nacimiento guardada,
// para precargar el formulario de perfil (que pide edad, no fecha exacta).
export const ageFromBirthDate = (birthDate?: string): number | "" => {
  if (!birthDate) return "";
  const year = new Date(birthDate).getUTCFullYear();
  return Number.isNaN(year) ? "" : new Date().getUTCFullYear() - year;
};
