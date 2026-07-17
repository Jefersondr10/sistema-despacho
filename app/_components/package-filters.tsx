"use client";

import { useState } from "react";

import type {
  Carrier,
  DateFilterMode,
  MelhorEnvioFilter,
  Marketplace,
  OperationFilter,
  PackageFilterValues,
  Store,
} from "@/app/_lib/mock-data";
import { createDefaultPackageFilters } from "@/app/_lib/mock-data";

type MultiFilterName = "lojaId" | "marketplace" | "transportadora";

type MultiSelectOption = {
  label: string;
  value: string;
};

function summarizeSelection({
  selected,
  options,
  allLabel,
}: {
  selected: string[];
  options: MultiSelectOption[];
  allLabel: string;
}) {
  const selectedValues =
    selected.length === 0
      ? options.map((option) => option.value)
      : selected.filter((value) =>
          options.some((option) => option.value === value),
        );

  if (selected.length === 0 || selectedValues.length === options.length) {
    return allLabel;
  }

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  if (selectedLabels.length <= 2) {
    return selectedLabels.join(", ");
  }

  return `${selectedLabels.length} selecionadas`;
}

function MultiSelectDropdown({
  label,
  allLabel,
  options,
  selected,
  open,
  onOpenChange,
  onToggleValue,
  onSelectAll,
}: {
  label: string;
  allLabel: string;
  options: MultiSelectOption[];
  selected: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleValue: (value: string) => void;
  onSelectAll: () => void;
}) {
  const selectedValues =
    selected.length === 0 ? options.map((option) => option.value) : selected;
  const allSelected =
    selected.length === 0 || selectedValues.length === options.length;
  const summary = summarizeSelection({ selected, options, allLabel });

  return (
    <div className="relative grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-950 transition hover:border-slate-400 focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-100"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{summary}</span>
        <span className="text-xs text-slate-500" aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onSelectAll}
              className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            Selecionar tudo
          </label>
          <div className="my-2 border-t border-slate-100" />
          {options.map((option) => (
            <label
              key={option.value}
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => onToggleValue(option.value)}
                className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PackageFilters({
  filters,
  stores,
  marketplaces,
  carriers,
  showSearch = false,
  showBatchCodeSearch = false,
  chipControls = true,
  searchLabel = "Buscar rastreio bipado",
  onChange,
}: {
  filters: PackageFilterValues;
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
  showSearch?: boolean;
  showBatchCodeSearch?: boolean;
  chipControls?: boolean;
  searchLabel?: string;
  onChange: (filters: PackageFilterValues) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<MultiFilterName | null>(null);

  const storeOptions = stores
    .filter((store) => store.status !== "Inativa")
    .map((store) => ({ label: store.name, value: store.id }));
  const marketplaceOptions = marketplaces
    .filter((marketplace) => marketplace.status !== "Inativo")
    .map((marketplace) => ({
      label: marketplace.name,
      value: marketplace.name,
    }));
  const carrierOptions = [
    { label: "Sem transportadora", value: "sem-transportadora" },
    ...carriers
      .filter((carrier) => carrier.status !== "Inativa")
      .map((carrier) => ({ label: carrier.name, value: carrier.name })),
  ];

  function updateFilter(
    name: keyof PackageFilterValues,
    value: PackageFilterValues[keyof PackageFilterValues],
  ) {
    onChange({ ...filters, [name]: value });
  }

  function updateDateFilter(name: "startDate" | "endDate", value: string) {
    onChange({ ...filters, dateMode: "range", [name]: value });
  }

  function updateDateMode(dateMode: DateFilterMode) {
    onChange({ ...filters, dateMode });
  }

  function getOptions(name: MultiFilterName) {
    if (name === "lojaId") {
      return storeOptions;
    }

    if (name === "marketplace") {
      return marketplaceOptions;
    }

    return carrierOptions;
  }

  function updateMultiFilter(name: MultiFilterName, value: string) {
    const options = getOptions(name);
    const allValues = options.map((option) => option.value);
    const current = filters[name].length === 0 ? allValues : filters[name];
    const next =
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
    const normalizedNext =
      next.length === 0 || next.length === allValues.length ? [] : next;

    onChange({ ...filters, [name]: normalizedNext });
  }

  function selectAll(name: MultiFilterName) {
    onChange({ ...filters, [name]: [] });
  }

  function resetFilters() {
    setOpenDropdown(null);
    onChange(createDefaultPackageFilters());
  }

  const chipClass = (active: boolean) =>
    `inline-flex min-h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-semibold transition ${
      active
        ? "border-teal-500 bg-teal-50 text-teal-900"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
    }`;

  return (
    <section className="no-print rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Filtros</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use Loja para manter unidades ou operações separadas.
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
        >
          Limpar filtros
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Data</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: "Dia atual", value: "today" },
              { label: "Dia específico", value: "single" },
              { label: "Período", value: "range" },
              { label: "Todos", value: "all" },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => updateDateMode(mode.value as DateFilterMode)}
                className={chipClass(filters.dateMode === mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {filters.dateMode === "single" ? (
            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
              Data
              <input
                type="date"
                required
                value={filters.selectedDate}
                onChange={(event) =>
                  updateFilter("selectedDate", event.target.value)
                }
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              />
            </label>
          ) : null}

          {filters.dateMode === "range" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Data inicial
                <input
                  type="date"
                  required
                  value={filters.startDate}
                  onChange={(event) =>
                    updateDateFilter("startDate", event.target.value)
                  }
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Data final
                <input
                  type="date"
                  required
                  value={filters.endDate}
                  onChange={(event) =>
                    updateDateFilter("endDate", event.target.value)
                  }
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">
            Identificação
          </h3>
          <div className="mt-3 grid gap-4 xl:grid-cols-3">
            <MultiSelectDropdown
              label="Loja"
              allLabel="Todas"
              options={storeOptions}
              selected={filters.lojaId}
              open={openDropdown === "lojaId"}
              onOpenChange={(open) => setOpenDropdown(open ? "lojaId" : null)}
              onToggleValue={(value) => updateMultiFilter("lojaId", value)}
              onSelectAll={() => selectAll("lojaId")}
            />
            <MultiSelectDropdown
              label="Marketplace"
              allLabel="Todos"
              options={marketplaceOptions}
              selected={filters.marketplace}
              open={openDropdown === "marketplace"}
              onOpenChange={(open) =>
                setOpenDropdown(open ? "marketplace" : null)
              }
              onToggleValue={(value) => updateMultiFilter("marketplace", value)}
              onSelectAll={() => selectAll("marketplace")}
            />
            <MultiSelectDropdown
              label="Transportadora"
              allLabel="Todas"
              options={carrierOptions}
              selected={filters.transportadora}
              open={openDropdown === "transportadora"}
              onOpenChange={(open) =>
                setOpenDropdown(open ? "transportadora" : null)
              }
              onToggleValue={(value) =>
                updateMultiFilter("transportadora", value)
              }
              onSelectAll={() => selectAll("transportadora")}
            />
          </div>
        </div>
      </div>

      <div
        className={`mt-4 grid gap-4 md:grid-cols-2 ${
          showSearch || showBatchCodeSearch
            ? showSearch && showBatchCodeSearch
              ? "xl:grid-cols-4"
              : "xl:grid-cols-3"
            : "xl:grid-cols-2"
        }`}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          {chipControls ? (
            <div className="grid justify-items-center gap-3 text-sm font-medium text-slate-700">
              Melhor Envio
              <div className="mx-auto grid w-full max-w-sm gap-2 sm:grid-cols-3">
                {[
                  { label: "Tudo", value: "todos" },
                  { label: "Sim", value: "sim" },
                  { label: "Não", value: "nao" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      updateFilter(
                        "melhorEnvio",
                        item.value as MelhorEnvioFilter,
                      )
                    }
                    className={chipClass(filters.melhorEnvio === item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          {chipControls ? (
            <div className="grid justify-items-center gap-3 text-sm font-medium text-slate-700">
              Coleta/Postagem
              <div className="mx-auto grid w-full max-w-sm gap-2 sm:grid-cols-3">
                {[
                  { label: "Tudo", value: "todos" },
                  { label: "Coleta", value: "coleta" },
                  { label: "Postagem", value: "postagem" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      updateFilter(
                        "tipoOperacao",
                        item.value as OperationFilter,
                      )
                    }
                    className={chipClass(filters.tipoOperacao === item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {showSearch ? (
          <label className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            {searchLabel}
            <input
              value={filters.query ?? ""}
              onChange={(event) => updateFilter("query", event.target.value)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold tracking-normal text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="Digite o código/rastreio bipado"
            />
          </label>
        ) : null}

        {showBatchCodeSearch ? (
          <label className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
            Codigo do lote
            <input
              value={filters.codigoLote ?? ""}
              onChange={(event) =>
                updateFilter("codigoLote", event.target.value)
              }
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold tracking-normal text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
              placeholder="LOTE-8F3A92"
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
