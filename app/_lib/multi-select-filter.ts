export type MultiSelectFilterName =
  | "lojaId"
  | "marketplace"
  | "transportadora";

export type MultiSelectState = {
  selected: string[];
  explicitlyEmpty: boolean;
};

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

export function resolveMultiSelectValues({
  selected,
  optionValues,
  explicitlyEmpty,
}: MultiSelectState & { optionValues: string[] }) {
  const availableValues = uniqueValues(optionValues);
  const availableSet = new Set(availableValues);
  const validSelected = uniqueValues(selected).filter((value) =>
    availableSet.has(value),
  );
  const selectedValues = explicitlyEmpty
    ? []
    : selected.length === 0
      ? availableValues
      : validSelected;

  return {
    selectedValues,
    allSelected:
      availableValues.length > 0 &&
      selectedValues.length === availableValues.length,
    noneSelected: selectedValues.length === 0,
  };
}

export function toggleAllMultiSelectValues({
  selected,
  optionValues,
  explicitlyEmpty,
}: MultiSelectState & { optionValues: string[] }): MultiSelectState {
  const { allSelected } = resolveMultiSelectValues({
    selected,
    optionValues,
    explicitlyEmpty,
  });

  return allSelected
    ? { selected: [], explicitlyEmpty: true }
    : { selected: [], explicitlyEmpty: false };
}

export function toggleMultiSelectValue({
  selected,
  optionValues,
  explicitlyEmpty,
  value,
}: MultiSelectState & {
  optionValues: string[];
  value: string;
}): MultiSelectState {
  const availableValues = uniqueValues(optionValues);

  if (!availableValues.includes(value)) {
    return { selected, explicitlyEmpty };
  }

  const { selectedValues } = resolveMultiSelectValues({
    selected,
    optionValues: availableValues,
    explicitlyEmpty,
  });
  const nextSelected = selectedValues.includes(value)
    ? selectedValues.filter((item) => item !== value)
    : [...selectedValues, value];

  if (nextSelected.length === 0) {
    return { selected: [], explicitlyEmpty: true };
  }

  if (nextSelected.length === availableValues.length) {
    return { selected: [], explicitlyEmpty: false };
  }

  return { selected: nextSelected, explicitlyEmpty: false };
}

export function updateEmptyMultiSelections(
  current: MultiSelectFilterName[] | undefined,
  name: MultiSelectFilterName,
  explicitlyEmpty: boolean,
) {
  const next = new Set(current ?? []);

  if (explicitlyEmpty) {
    next.add(name);
  } else {
    next.delete(name);
  }

  return Array.from(next);
}
