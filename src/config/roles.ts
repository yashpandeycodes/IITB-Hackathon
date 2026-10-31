import {
  Drama,
  GraduationCap,
  Landmark,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/contracts/enums";

export type RoleMeta = {
  /** Short label for badges ("Admin", "Dept coordinator", …). */
  label: string;
  icon: LucideIcon;
  /** Tinted icon tile / badge classes built from the semantic tokens. */
  tone: string;
};

export const ROLE_META: Record<Role, RoleMeta> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    tone: "bg-cat-institute-subtle text-cat-institute-foreground",
  },
  department_coordinator: {
    label: "Dept coordinator",
    icon: Landmark,
    tone: "bg-cat-department-subtle text-cat-department-foreground",
  },
  faculty: {
    label: "Faculty",
    icon: GraduationCap,
    tone: "bg-kind-lecture-subtle text-kind-lecture-foreground",
  },
  club: {
    label: "Club rep",
    icon: Drama,
    tone: "bg-cat-club-subtle text-cat-club-foreground",
  },
};
