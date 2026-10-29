import { useTranslations } from "next-intl";
import MenuItem from "./MenuItem";
import { MenuSection } from "../interfaces/category";

interface MenuCategoryProps {
  section: MenuSection;
  showSectionName?: boolean;
  onRestaurantClosed: () => void;
}

export default function MenuCategory({
  section,
  showSectionName = false,
  onRestaurantClosed,
}: MenuCategoryProps) {
  const t = useTranslations("MenuCategory");
  return (
    <section
      className="w-full mb-4 md:mb-5"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 400px" }}
    >
      {showSectionName && section.name && (
        <h2 className="text-black text-xl md:text-2xl lg:text-3xl font-medium">
          {section.name}
        </h2>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-6 md:gap-x-8 lg:gap-x-10">
        {section.items && section.items.length > 0 ? (
          section.items.map((item) => (
            <MenuItem
              key={item.id}
              item={item}
              onRestaurantClosed={onRestaurantClosed}
            />
          ))
        ) : (
          <div className="col-span-full text-center py-4 md:py-6 lg:py-8">
            <p className="text-gray-500 text-base md:text-lg lg:text-xl">
              {t("noItemsInSection")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
