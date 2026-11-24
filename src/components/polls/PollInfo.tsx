import { MapPin, Store, UtensilsCrossed } from "lucide-react";

/** 모임 정보(음식 종류·식당·위치). 비어 있는 항목은 보여 주지 않고, 전부 비면 아무것도 그리지 않는다. */
export function PollInfo({ foodType, restaurant, location }: { foodType: string; restaurant: string; location: string }) {
  const items = [
    { Icon: UtensilsCrossed, label: "음식", value: foodType },
    { Icon: Store, label: "식당", value: restaurant },
    { Icon: MapPin, label: "위치", value: location },
  ].filter((item) => item.value);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
      {items.map(({ Icon, label, value }) => (
        <li key={label} className="flex items-center gap-1.5">
          <Icon className="size-4 shrink-0" aria-label={label} />
          <span className="text-ink">{value}</span>
        </li>
      ))}
    </ul>
  );
}
