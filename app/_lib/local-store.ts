"use client";

import { useMemo, useState } from "react";

import type {
  Carrier,
  DispatchBatch,
  DispatchPackage,
  Marketplace,
  PackageCancellation,
  PackageMovement,
  Store,
} from "@/app/_lib/mock-data";
import {
  getActivePackages,
  normalizeTrackingCode,
} from "@/app/_lib/mock-data";

const CATALOGS_KEY = "sistema-despacho-catalogs-v1";
const PACKAGES_KEY = "sistema-despacho-packages-v1";
const BATCHES_KEY = "sistema-despacho-batches-v1";
const MOVEMENTS_KEY = "sistema-despacho-movements-v1";
const CANCELLATIONS_KEY = "sistema-despacho-cancellations-v1";

type CatalogState = {
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function dedupePackages(packages: DispatchPackage[]) {
  const seen = new Set<string>();
  const unique: DispatchPackage[] = [];

  for (const item of packages) {
    const normalized = normalizeTrackingCode(item.codigo_rastreio);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push({
      ...item,
      lote_id: item.lote_id || "lote-local-legado",
    });
  }

  return unique;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}

export function useCatalogs(initialCatalogs: CatalogState) {
  const [catalogs, setCatalogs] = useState<CatalogState>(() => {
    const saved = readJson<CatalogState>(CATALOGS_KEY);
    if (saved?.stores && saved.marketplaces && saved.carriers) {
      return saved;
    }

    return initialCatalogs;
  });

  function persist(next: CatalogState) {
    setCatalogs(next);
    writeJson(CATALOGS_KEY, next);
  }

  function addStore(name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      return false;
    }

    const existing = catalogs.stores.find(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing?.status === "Inativa") {
      persist({
        ...catalogs,
        stores: catalogs.stores.map((item) =>
          item.id === existing.id ? { ...item, status: "Ativa" } : item,
        ),
      });
      return true;
    }

    if (existing) {
      return false;
    }

    persist({
      ...catalogs,
      stores: [
        ...catalogs.stores,
        {
          id: slugify(cleanName) || `loja-${Date.now()}`,
          name: cleanName,
          document: "Não informado",
          city: "Não informada",
          status: "Ativa",
        },
      ],
    });
    return true;
  }

  function addMarketplace(name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      return false;
    }

    const existing = catalogs.marketplaces.find(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing?.status === "Inativo") {
      persist({
        ...catalogs,
        marketplaces: catalogs.marketplaces.map((item) =>
          item.id === existing.id ? { ...item, status: "Ativo" } : item,
        ),
      });
      return true;
    }

    if (existing) {
      return false;
    }

    persist({
      ...catalogs,
      marketplaces: [
        ...catalogs.marketplaces,
        {
          id: slugify(cleanName) || `marketplace-${Date.now()}`,
          name: cleanName,
          code: cleanName.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase(),
          status: "Ativo",
        },
      ],
    });
    return true;
  }

  function addCarrier(name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      return false;
    }

    const existing = catalogs.carriers.find(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing?.status === "Inativa") {
      persist({
        ...catalogs,
        carriers: catalogs.carriers.map((item) =>
          item.id === existing.id ? { ...item, status: "Ativa" } : item,
        ),
      });
      return true;
    }

    if (existing) {
      return false;
    }

    persist({
      ...catalogs,
      carriers: [
        ...catalogs.carriers,
        {
          id: slugify(cleanName) || `transportadora-${Date.now()}`,
          name: cleanName,
          service: "Não informado",
          status: "Ativa",
        },
      ],
    });
    return true;
  }

  function removeStore(id: string) {
    persist({
      ...catalogs,
      stores: catalogs.stores.map((item) =>
        item.id === id ? { ...item, status: "Inativa" } : item,
      ),
    });
  }

  function removeMarketplace(id: string) {
    persist({
      ...catalogs,
      marketplaces: catalogs.marketplaces.map((item) =>
        item.id === id ? { ...item, status: "Inativo" } : item,
      ),
    });
  }

  function removeCarrier(id: string) {
    persist({
      ...catalogs,
      carriers: catalogs.carriers.map((item) =>
        item.id === id ? { ...item, status: "Inativa" } : item,
      ),
    });
  }

  return {
    ...catalogs,
    addStore,
    addMarketplace,
    addCarrier,
    removeStore,
    removeMarketplace,
    removeCarrier,
  };
}

export function useStoredPackages(
  initialPackages: DispatchPackage[],
  initialCancellations: PackageCancellation[] = [],
) {
  const [localPackages, setLocalPackages] = useState<DispatchPackage[]>(() => {
    const saved = readJson<DispatchPackage[]>(PACKAGES_KEY);
    if (Array.isArray(saved)) {
      return dedupePackages(saved);
    }

    return [];
  });

  const [localCancellations] = useState<PackageCancellation[]>(() => {
    const saved = readJson<PackageCancellation[]>(CANCELLATIONS_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });
  const cancellations = useMemo(
    () => dedupeById([...initialCancellations, ...localCancellations]),
    [initialCancellations, localCancellations],
  );
  const packages = useMemo(
    () =>
      getActivePackages(
        dedupePackages([...initialPackages, ...localPackages]),
        cancellations,
      ),
    [initialPackages, localPackages, cancellations],
  );
  const allPackages = useMemo(
    () => dedupePackages([...initialPackages, ...localPackages]),
    [initialPackages, localPackages],
  );

  function addPackages(nextPackages: DispatchPackage[]) {
    const existing = new Set(
      allPackages.map((item) => normalizeTrackingCode(item.codigo_rastreio)),
    );
    const accepted: DispatchPackage[] = [];
    const duplicates: DispatchPackage[] = [];

    for (const item of nextPackages) {
      const normalized = normalizeTrackingCode(item.codigo_rastreio);
      if (existing.has(normalized)) {
        duplicates.push(item);
        continue;
      }
      existing.add(normalized);
      accepted.push(item);
    }

    if (accepted.length) {
      const updated = dedupePackages([...localPackages, ...accepted]);
      setLocalPackages(updated);
      writeJson(PACKAGES_KEY, updated);
    }

    return {
      added: accepted.length,
      duplicates,
    };
  }

  return {
    packages,
    allPackages,
    addPackages,
  };
}

export function usePackageCancellations(
  initialCancellations: PackageCancellation[] = [],
) {
  const [localCancellations, setLocalCancellations] = useState<
    PackageCancellation[]
  >(() => {
    const saved = readJson<PackageCancellation[]>(CANCELLATIONS_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });

  const cancellations = useMemo(
    () => dedupeById([...initialCancellations, ...localCancellations]),
    [initialCancellations, localCancellations],
  );

  function addCancellations(records: PackageCancellation[]) {
    if (!records.length) {
      return { added: 0 };
    }

    const existing = new Set(cancellations.map((item) => item.id));
    const accepted = records.filter((item) => !existing.has(item.id));
    const nextCancellations = dedupeById([...localCancellations, ...accepted]);

    setLocalCancellations(nextCancellations);
    writeJson(CANCELLATIONS_KEY, nextCancellations);

    return { added: accepted.length };
  }

  return {
    cancellations,
    addCancellations,
  };
}

export function useStoredMovements(initialMovements: PackageMovement[]) {
  const [localMovements] = useState<PackageMovement[]>(() => {
    const saved = readJson<PackageMovement[]>(MOVEMENTS_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });

  const movements = useMemo(
    () => dedupeById([...initialMovements, ...localMovements]),
    [initialMovements, localMovements],
  );

  return { movements };
}

export function useDispatchStorage({
  initialPackages,
  initialBatches,
  initialMovements,
  initialCancellations = [],
}: {
  initialPackages: DispatchPackage[];
  initialBatches: DispatchBatch[];
  initialMovements: PackageMovement[];
  initialCancellations?: PackageCancellation[];
}) {
  const [localPackages, setLocalPackages] = useState<DispatchPackage[]>(() => {
    const saved = readJson<DispatchPackage[]>(PACKAGES_KEY);
    if (Array.isArray(saved)) {
      return dedupePackages(saved);
    }

    return [];
  });
  const [localBatches, setLocalBatches] = useState<DispatchBatch[]>(() => {
    const saved = readJson<DispatchBatch[]>(BATCHES_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });
  const [localMovements, setLocalMovements] = useState<PackageMovement[]>(() => {
    const saved = readJson<PackageMovement[]>(MOVEMENTS_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });

  const [localCancellations, setLocalCancellations] = useState<
    PackageCancellation[]
  >(() => {
    const saved = readJson<PackageCancellation[]>(CANCELLATIONS_KEY);
    if (Array.isArray(saved)) {
      return dedupeById(saved);
    }

    return [];
  });

  const packages = useMemo(
    () => dedupePackages([...initialPackages, ...localPackages]),
    [initialPackages, localPackages],
  );
  const batches = useMemo(
    () => dedupeById([...initialBatches, ...localBatches]),
    [initialBatches, localBatches],
  );
  const movements = useMemo(
    () => dedupeById([...initialMovements, ...localMovements]),
    [initialMovements, localMovements],
  );
  const cancellations = useMemo(
    () => dedupeById([...initialCancellations, ...localCancellations]),
    [initialCancellations, localCancellations],
  );
  const activePackages = useMemo(
    () => getActivePackages(packages, cancellations),
    [packages, cancellations],
  );

  function addFinishedBatch({
    batch,
    batchPackages,
    batchMovements,
  }: {
    batch: DispatchBatch;
    batchPackages: DispatchPackage[];
    batchMovements: PackageMovement[];
  }) {
    const existing = new Set(
      packages.map((item) => normalizeTrackingCode(item.codigo_rastreio)),
    );
    const acceptedPackages: DispatchPackage[] = [];
    const duplicates: DispatchPackage[] = [];

    for (const item of batchPackages) {
      const normalized = normalizeTrackingCode(item.codigo_rastreio);
      if (existing.has(normalized)) {
        duplicates.push(item);
        continue;
      }
      existing.add(normalized);
      acceptedPackages.push(item);
    }

    if (!acceptedPackages.length) {
      return {
        added: 0,
        batch: null,
        duplicates,
      };
    }

    const savedBatch: DispatchBatch = {
      ...batch,
      total_pacotes: acceptedPackages.length,
    };
    const acceptedIds = new Set(acceptedPackages.map((item) => item.id));
    const acceptedMovements = batchMovements.filter((item) =>
      acceptedIds.has(item.pacote_id),
    );

    const nextPackages = dedupePackages([...localPackages, ...acceptedPackages]);
    const nextBatches = dedupeById([savedBatch, ...localBatches]);
    const nextMovements = dedupeById([...localMovements, ...acceptedMovements]);

    setLocalPackages(nextPackages);
    setLocalBatches(nextBatches);
    setLocalMovements(nextMovements);
    writeJson(PACKAGES_KEY, nextPackages);
    writeJson(BATCHES_KEY, nextBatches);
    writeJson(MOVEMENTS_KEY, nextMovements);

    return {
      added: acceptedPackages.length,
      batch: savedBatch,
      duplicates,
    };
  }

  function addPackageCancellations(
    records: PackageCancellation[],
    cancellationMovements: PackageMovement[] = [],
  ) {
    if (!records.length) {
      return { added: 0 };
    }

    const existing = new Set(cancellations.map((item) => item.id));
    const accepted = records.filter((item) => !existing.has(item.id));
    const nextCancellations = dedupeById([...localCancellations, ...accepted]);
    const nextMovements = dedupeById([
      ...localMovements,
      ...cancellationMovements,
    ]);

    setLocalCancellations(nextCancellations);
    setLocalMovements(nextMovements);
    writeJson(CANCELLATIONS_KEY, nextCancellations);
    writeJson(MOVEMENTS_KEY, nextMovements);

    return { added: accepted.length };
  }

  function updatePackageCancellation(
    cancellationId: string,
    justificativaIndividual: string,
  ) {
    const nextCancellations = localCancellations.map((item) =>
      item.id === cancellationId
        ? { ...item, justificativa_individual: justificativaIndividual }
        : item,
    );

    setLocalCancellations(nextCancellations);
    writeJson(CANCELLATIONS_KEY, nextCancellations);
  }

  return {
    packages,
    activePackages,
    batches,
    movements,
    cancellations,
    addFinishedBatch,
    addPackageCancellations,
    updatePackageCancellation,
  };
}
