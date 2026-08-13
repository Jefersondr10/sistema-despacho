"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectFieldOption = {
  value: string;
  label: string;
};

type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

export function SelectField({
  label,
  value,
  options,
  placeholder,
  disabled = false,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectFieldOption[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 12;
    const menuGap = 8;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < 180 && availableAbove > availableBelow;
    const availableSpace = Math.max(
      80,
      (openAbove ? availableAbove : availableBelow) - menuGap,
    );
    const desiredHeight = Math.min(288, options.length * 48 + 12);
    const maxHeight = Math.min(desiredHeight, availableSpace);
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );
    const top = openAbove
      ? Math.max(viewportPadding, rect.top - maxHeight - menuGap)
      : rect.bottom + menuGap;

    setMenuPosition({ left, maxHeight, top, width });
  }, [options.length]);

  function openMenu() {
    if (disabled || options.length === 0) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false);
    setMenuPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    }
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeMenu({ restoreFocus: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
    } else if (event.key === "Escape" || event.key === "Tab") {
      closeMenu({ restoreFocus: event.key === "Escape" });
    }
  }

  useLayoutEffect(() => {
    if (!open) return;

    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu();
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const listboxId = `${fieldId}-listbox`;
  const labelId = `${fieldId}-label`;
  const activeOptionId = `${fieldId}-option-${activeIndex}`;

  return (
    <div className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
      <span id={labelId}>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        aria-required={required}
        aria-activedescendant={open ? activeOptionId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm font-semibold shadow-sm outline-none transition-all ${
          open
            ? "border-teal-600 ring-4 ring-teal-100"
            : "border-slate-300 hover:border-slate-400 hover:shadow-md"
        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none`}
      >
        <span className={`truncate ${selectedOption ? "text-slate-950" : "text-slate-500"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-lg text-slate-500 transition ${
            open ? "rotate-180 bg-teal-50 text-teal-700" : "bg-slate-50"
          }`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </span>
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              className="app-scroll-region fixed z-[100] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/[0.98] p-1.5 shadow-[0_24px_70px_-22px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/5 backdrop-blur-xl"
              style={{
                left: menuPosition.left,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                width: menuPosition.width,
              }}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;

                return (
                  <button
                    key={option.value}
                    id={`${fieldId}-option-${index}`}
                    data-option-index={index}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(index)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      active
                        ? "bg-teal-50 text-teal-950"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <span className="min-w-0 break-words">{option.label}</span>
                    {selected ? (
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-700 text-white" aria-hidden="true">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                          <path d="m5 10 3 3 7-7" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
