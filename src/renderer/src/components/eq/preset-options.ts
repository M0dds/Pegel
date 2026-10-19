import { BUILTIN_PRESETS } from '@shared/presets';
import type { EqSettings } from '@shared/types';
import type { SelectGroup, SelectOption } from '../Select';

/** Select groups "Standard" and "Eigene", optionally preceded by extra options. */
export function presetGroups(eq: EqSettings, first: SelectOption[] = []): SelectGroup[] {
  const groups: SelectGroup[] = [];
  if (first.length) groups.push({ options: first });
  groups.push({
    label: 'Standard',
    options: BUILTIN_PRESETS.map((p) => ({ value: p.name, label: p.name })),
  });
  if (eq.customPresets.length) {
    groups.push({
      label: 'Eigene',
      options: eq.customPresets.map((p) => ({ value: p.name, label: p.name })),
    });
  }
  return groups;
}
