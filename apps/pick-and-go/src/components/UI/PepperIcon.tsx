import { TwinPebbleIdle } from "@/components/UI/PepperMascots";

export default function PepperIcon({
  className = "size-full",
}: {
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-full ${className}`}>
      <TwinPebbleIdle className="absolute left-1/2 bottom-0 h-full w-[110%] -translate-x-1/2 -translate-y-[6%]" />
    </div>
  );
}
