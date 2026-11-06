// Posición del menú al abrir un platillo, para restaurarla al volver (back o agregar al carrito).
// Vive en memoria del módulo: sobrevive navegaciones del cliente, no recargas.

type MenuPosition = {
  key: string;
  category: string;
  itemId: string;
  itemTop: number;
};

let currentCategory = "Todo";
let saved: MenuPosition | null = null;

export function setMenuCategory(category: string) {
  currentCategory = category;
}

// Se guarda la posición relativa del platillo tocado (no scrollY), porque las secciones
// usan content-visibility y su altura estimada cambia al re-montar el menú
export function rememberMenuPosition(key: string, itemId: string, el: HTMLElement) {
  saved = {
    key,
    category: currentCategory,
    itemId,
    itemTop: el.getBoundingClientRect().top,
  };
}

export function takeMenuPosition(key: string): MenuPosition | null {
  const position = saved?.key === key ? saved : null;
  saved = null;
  return position;
}
