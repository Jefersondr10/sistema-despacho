"use client";

import { FormEvent, useState } from "react";

import {
  Badge,
  ConfirmDialog,
  EmptyState,
  FeedbackMessage,
  StatusBadge,
} from "@/app/_components/ui";
import type { Carrier, Marketplace, Store } from "@/app/_lib/mock-data";
import { useCatalogs } from "@/app/_lib/local-store";

type CatalogItem = {
  id: string;
  name: string;
  status?: string;
};

type SectionMessage = {
  tone: "success" | "warning" | "danger" | "neutral";
  text: string;
};

function isInactive(item: CatalogItem) {
  return item.status === "Inativa" || item.status === "Inativo";
}

function CatalogSection({
  title,
  description,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  items: CatalogItem[];
  onAdd: (name: string) => boolean;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<SectionMessage | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CatalogItem | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = onAdd(name);

    if (!added) {
      setMessage({
        tone: "warning",
        text: "Informe um nome válido e ainda não cadastrado.",
      });
      return;
    }

    setMessage({ tone: "success", text: "Cadastro adicionado." });
    setName("");
  }

  function requestRemoval(item: CatalogItem) {
    if (isInactive(item)) {
      return;
    }

    setPendingRemoval(item);
  }

  function confirmRemoval() {
    if (!pendingRemoval) {
      return;
    }

    onRemove(pendingRemoval.id);
    setMessage({
      tone: "neutral",
      text: "Cadastro inativado para preservar o histórico.",
    });
    setPendingRemoval(null);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
            placeholder={placeholder}
          />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Cadastrar
          </button>
        </form>

        {message ? (
          <div className="mt-3">
            <FeedbackMessage tone={message.tone}>{message.text}</FeedbackMessage>
          </div>
        ) : null}

        <div className="mt-5">
          {items.length ? (
            <div className="grid gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">
                      {item.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="neutral">{item.id}</Badge>
                      {item.status ? <StatusBadge status={item.status} /> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isInactive(item)}
                    onClick={() => requestRemoval(item)}
                    className="inline-flex min-h-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {isInactive(item) ? "Inativo" : "Excluir"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum item cadastrado.</EmptyState>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Confirmar exclusão"
        message={`Deseja excluir ${pendingRemoval?.name ?? "este cadastro"}? O item será inativado para não comprometer o histórico.`}
        cancelLabel="Cancelar"
        confirmLabel="Excluir"
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={confirmRemoval}
      />
    </section>
  );
}

export function CadastrosView({
  stores,
  marketplaces,
  carriers,
}: {
  stores: Store[];
  marketplaces: Marketplace[];
  carriers: Carrier[];
}) {
  const catalogs = useCatalogs({ stores, marketplaces, carriers });

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <CatalogSection
        title="Lojas"
        description="Use para separar a operação, como Brasília e São Paulo."
        placeholder="Nome da loja"
        items={catalogs.stores}
        onAdd={catalogs.addStore}
        onRemove={catalogs.removeStore}
      />
      <CatalogSection
        title="Marketplaces"
        description="Canais de venda disponíveis na bipagem e nos filtros."
        placeholder="Nome do marketplace"
        items={catalogs.marketplaces}
        onAdd={catalogs.addMarketplace}
        onRemove={catalogs.removeMarketplace}
      />
      <CatalogSection
        title="Transportadoras"
        description="Obrigatórias quando Melhor Envio estiver marcado como Sim."
        placeholder="Nome da transportadora"
        items={catalogs.carriers}
        onAdd={catalogs.addCarrier}
        onRemove={catalogs.removeCarrier}
      />
    </div>
  );
}
