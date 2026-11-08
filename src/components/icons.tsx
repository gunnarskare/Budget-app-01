import {
  Baby,
  Bike,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  type LucideIcon,
  Music,
  Package,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Repeat,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Tag,
  Target,
  Ticket,
  TrendingUp,
  Umbrella,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

/** Kuratert ikonsett for kategorier og sparemål (lagres som tekstnøkkel i databasen). */
export const ICONS: Record<string, LucideIcon> = {
  house: House,
  "shopping-basket": ShoppingBasket,
  car: Car,
  utensils: Utensils,
  "shopping-bag": ShoppingBag,
  repeat: Repeat,
  baby: Baby,
  "heart-pulse": HeartPulse,
  ticket: Ticket,
  landmark: Landmark,
  wallet: Wallet,
  package: Package,
  tag: Tag,
  "piggy-bank": PiggyBank,
  plane: Plane,
  gift: Gift,
  "graduation-cap": GraduationCap,
  dumbbell: Dumbbell,
  coffee: Coffee,
  fuel: Fuel,
  bus: Bus,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  film: Film,
  gamepad: Gamepad2,
  music: Music,
  shirt: Shirt,
  wrench: Wrench,
  shield: Shield,
  pill: Pill,
  sofa: Sofa,
  paw: PawPrint,
  sparkles: Sparkles,
  trending: TrendingUp,
  target: Target,
  umbrella: Umbrella,
  bike: Bike,
  laptop: Laptop,
  briefcase: Briefcase,
  heart: Heart,
};

export const ICON_NAMES = Object.keys(ICONS);

export function getIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Tag;
}

export function Icon({
  name,
  className,
  strokeWidth = 2,
  ...rest
}: {
  name: string | null | undefined;
  className?: string;
  strokeWidth?: number;
} & Omit<React.SVGProps<SVGSVGElement>, "ref">) {
  const C = getIcon(name);
  return <C className={className} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
