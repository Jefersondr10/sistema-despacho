"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useTeam } from "@/app/_lib/team-context";

const mainNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/bipagem", label: "Bipar Pacotes", icon: "scan" },
  { href: "/pacotes", label: "Pacotes", icon: "package" },
  { href: "/pacotes-cancelados", label: "Cancelados", icon: "cancel" },
  { href: "/relatorios", label: "Relatórios", icon: "report" },
  { href: "/cadastros", label: "Cadastros", icon: "settings" },
  { href: "/equipe", label: "Equipe", icon: "team" },
  { href: "/feedback", label: "Feedback", icon: "feedback" },
] as const;

type NavigationItem = (typeof mainNavItems)[number];
type NavigationIcon = NavigationItem["icon"];

function NavIcon({ icon }: { icon: NavigationIcon }) {
  const paths: Record<NavigationIcon, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="4" rx="2" />
        <rect x="14" y="11" width="7" height="10" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
      </>
    ),
    scan: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="m8 10 4-2 4 2-4 2-4-2Z" />
        <path d="m8 10v5l4 2 4-2v-5M12 12v5" />
      </>
    ),
    package: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="M4 7v10l8 4 8-4V7M12 11v10" />
        <path d="m8 5 8 4" />
      </>
    ),
    cancel: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="M4 7v10l8 4 8-4V7M12 11v3" />
        <path d="m15.5 15.5 4 4m0-4-4 4" />
      </>
    ),
    report: (
      <>
        <path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5M8 17v-3M12 17v-6M16 17v-4" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
        <circle cx="10" cy="12" r="2" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5 5 0 0 1 3 5" />
      </>
    ),
    feedback: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A9 9 0 1 1 21 12Z" />
        <path d="M8 10h8M8 14h5" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.125rem]"
      aria-hidden="true"
    >
      {paths[icon]}
    </svg>
  );
}

function NavigationLink({
  item,
  compact,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  compact: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={`group relative flex min-h-[3.25rem] items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold tracking-[-0.01em] transition-all duration-200 ${
        isActive
          ? "border-teal-200/80 bg-gradient-to-r from-teal-50 to-cyan-50/50 text-teal-950 shadow-[0_8px_24px_-16px_rgba(13,148,136,0.65)]"
          : "border-transparent text-slate-600 hover:border-slate-200/90 hover:bg-white/90 hover:text-slate-950 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)]"
      } ${compact ? "min-w-max snap-start" : "w-full"}`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl transition-all duration-200 ${
          isActive
            ? "bg-teal-700 text-white shadow-md shadow-teal-900/15"
            : "border border-slate-200/80 bg-slate-50 text-slate-500 group-hover:border-teal-100 group-hover:bg-teal-50 group-hover:text-teal-700"
        }`}
        aria-hidden="true"
      >
        <NavIcon icon={item.icon} />
      </span>
      <span className="min-w-0 whitespace-nowrap">{item.label}</span>
      {!compact && isActive ? (
        <span
          className="ml-auto size-1.5 shrink-0 rounded-full bg-teal-600 shadow-[0_0_0_4px_rgba(20,184,166,0.12)]"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

export function Navigation({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { context: teamContext } = useTeam();
  const visibleItems = mainNavItems.filter(
    (item) => item.href !== "/equipe" || teamContext?.can_manage_team,
  );

  return (
    <nav
      className={
        compact
          ? "app-scroll-region-x flex max-w-full snap-x gap-2.5"
          : "flex flex-col gap-2"
      }
      aria-label="Navegação principal"
    >
      {visibleItems.map((item) => (
        <NavigationLink
          key={item.href}
          item={item}
          compact={compact}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
