import { MenuItemData } from "../interfaces/menuItemData";
import { Category } from "../interfaces/category";

// Datos del menú
export const menuData: Category[] = [
  /*{
    id: 1,
    category: "Desayunos",
    icon: "🍳",
    items: [
      {
        id: 1,
        name: "Huevos Benedictinos",
        description: "Huevos pochados sobre pan tostado con salsa holandesa",
        price: 12.99,
        images: [
          "https://www.cocinavital.mx/wp-content/uploads/2017/09/huevos-benedictinos.jpg",
        ],
        features: ["Picante 🌶️", "Más Vendido 🏆"],
      },
      {
        id: 2,
        name: "Pancakes Americanos",
        description: "Stack de 3 pancakes con miel de maple y frutos rojos",
        price: 9.99,
        images: [
          "https://osojimix.com/wp-content/uploads/2021/07/PANCAKES-AMERICANOS-500x500.jpg",
        ],
        features: ["Miel 🍯"],
      },
      {
        id: 3,
        name: "Avocado Toast",
        description:
          "Pan artesanal con aguacate, tomate cherry y semillas, Pan artesanal con aguacate, tomate cherry y semillas",
        price: 8.99,
        images: [
          "https://gratefulgrazer.com/wp-content/uploads/2025/01/fried-egg-avocado-toast-with-chili-crunch.jpg",
        ],
        features: ["Salud 🥬", "Pan 🍞"],
      },
    ],
  },
  {
    id: 2,
    category: "Bebidas",
    icon: "☕",
    items: [
      {
        id: 4,
        name: "Cappuccino Artesanal",
        description: "Espresso con leche vaporizada y arte latte",
        price: 4.99,
        images: [
          "https://img.freepik.com/fotos-premium/capuccino-taza-barro-artesanal-especias-canela-anis_290431-11355.jpg",
          "https://img.freepik.com/fotos-premium/granos-especias-taza-cafe_522560-12420.jpg",
        ],
        features: ["Coffee ☕"],
      },
      {
        id: 5,
        name: "Smoothie Tropical",
        description: "Mango, piña, coco y un toque de jengibre",
        price: 6.99,
        images: [
          "https://www.jessicagavin.com/wp-content/uploads/2020/06/tropical-smoothie-5-1200.jpg",
        ],
        features: ["Frutas 🥭", "Bebida 🥛"],
      },
      {
        id: 6,
        name: "Té Chai Latte",
        description: "Mezcla de especias con leche cremosa",
        price: 5.99,
        images: [
          "https://www.splenda.com/wp-content/themes/bistrotheme/assets/recipe-images/vanilla-chai-latte.jpg",
        ],
        features: ["Coffee ☕", "Bebida 🥛"],
      },
    ],
  },*/
];

// Función para buscar un plato por ID
export function findDishById(
  id: number
): { dish: MenuItemData; category: Category } | null {
  for (const category of menuData) {
    const dish = category.items.find((item) => item.id === id);
    if (dish) {
      return { dish, category };
    }
  }
  return null;
}
