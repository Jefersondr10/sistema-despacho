"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", marker: "D" },
  { href: "/bipagem", label: "Bipagem", marker: "B" },
  { href: "/pacotes", label: "Pacotes", marker: "P" },
  { href: "/pacotes-cancelados", label: "Pacotes Cancelados", marker: "!" },
  { href: "/relatorios", label: "Relatórios", marker: "R" },
  { href: "/cadastros", label: "Cadastros", marker: "C" },
];

export function Navigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={
        compact
          ? "flex gap-2 overflow-x-auto pb-1"
          : "flex flex-col gap-1"
      }
      aria-label="Navegação principal"
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
            } ${compact ? "min-w-max" : ""}`}
          >
            <span
              className={`grid size-7 place-items-center rounded-md text-xs font-semibold ${
                isActive
                  ? "bg-teal-700 text-white"
                  : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
              }`}
              aria-hidden="true"
            >
              {item.marker}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
