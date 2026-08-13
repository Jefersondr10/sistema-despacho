"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", marker: "D" },
  { href: "/bipagem", label: "Bipar Pacotes", marker: "BP" },
  { href: "/pacotes", label: "Pacotes", marker: "P" },
  { href: "/pacotes-cancelados", label: "Cancelados", marker: "X" },
  { href: "/relatorios", label: "Relatórios", marker: "R" },
  { href: "/cadastros", label: "Cadastros", marker: "C" },
];

export function Navigation({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={
        compact
          ? "app-scroll-region-x flex max-w-full snap-x gap-2"
          : "flex flex-col gap-1.5"
      }
      aria-label="Navegação principal"
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`group flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition duration-200 ${
              isActive
                ? "border-teal-200 bg-teal-50 text-teal-900 shadow-sm shadow-teal-950/5"
                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950 hover:shadow-sm"
            } ${compact ? "min-w-max snap-start" : "w-full"}`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold tracking-tight transition ${
                isActive
                  ? "bg-teal-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-700"
              }`}
              aria-hidden="true"
            >
              {item.marker}
            </span>
            <span className="min-w-0">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
