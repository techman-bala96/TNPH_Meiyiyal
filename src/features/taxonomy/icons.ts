import {
  Activity, Apple, Brain, Briefcase, Building2, Car, Code2, Cog, Cpu, Droplet, FileText, FlaskConical, Flower2, HardHat, House,
  Landmark, Leaf, Percent, Pill, Receipt, Ruler, Scale, Shield, ShoppingBag, Smile, Sofa, Sprout, Stethoscope, Sun, Users, Wifi, Zap,
  type LucideIcon,
} from "lucide-react";
const MAP: Record<string, LucideIcon> = {
  activity: Activity, apple: Apple, brain: Brain, briefcase: Briefcase, building: Building2, car: Car, code: Code2, cog: Cog, cpu: Cpu,
  droplet: Droplet, "file-text": FileText, flask: FlaskConical, flower: Flower2, "hard-hat": HardHat, home: House, landmark: Landmark,
  leaf: Leaf, percent: Percent, pill: Pill, receipt: Receipt, ruler: Ruler, scale: Scale, shield: Shield, "shopping-bag": ShoppingBag,
  smile: Smile, sofa: Sofa, sprout: Sprout, stethoscope: Stethoscope, sun: Sun, users: Users, wifi: Wifi, zap: Zap,
};
export const iconFor = (name: string | null | undefined, fallback: LucideIcon = Briefcase) => (name && MAP[name]) || fallback;
