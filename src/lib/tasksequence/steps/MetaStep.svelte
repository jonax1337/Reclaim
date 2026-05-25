<script lang="ts">
  import { Switch, Select } from "$lib/ui";
  import { UserCircle2 } from "@lucide/svelte";
  import type { MetaConfig } from "../types";
  import { sequence } from "../store.svelte";

  type Props = { id: string; config: MetaConfig };
  let { id, config }: Props = $props();

  const LOCALES = [
    { id: "de-de", label: "Deutsch (Deutschland)", language: "de-DE", keyboard: "0407:00000407", systemLocale: "de-DE", userLocale: "de-DE", timezone: "W. Europe Standard Time", geoId: "94" },
    { id: "en-us", label: "English (US)", language: "en-US", keyboard: "0409:00000409", systemLocale: "en-US", userLocale: "en-US", timezone: "Pacific Standard Time", geoId: "244" },
    { id: "en-gb", label: "English (UK)", language: "en-GB", keyboard: "0809:00000809", systemLocale: "en-GB", userLocale: "en-GB", timezone: "GMT Standard Time", geoId: "242" },
    { id: "fr-fr", label: "Français", language: "fr-FR", keyboard: "040C:0000040C", systemLocale: "fr-FR", userLocale: "fr-FR", timezone: "Romance Standard Time", geoId: "84" },
    { id: "es-es", label: "Español", language: "es-ES", keyboard: "040A:0000040A", systemLocale: "es-ES", userLocale: "es-ES", timezone: "Romance Standard Time", geoId: "217" },
  ];

  const currentLocaleId = $derived(
    LOCALES.find((l) => l.language === config.language)?.id ?? "de-de",
  );
  const currentLocale = $derived(
    LOCALES.find((l) => l.id === currentLocaleId) ?? LOCALES[0],
  );

  const fieldClass = "h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-xs font-medium text-muted-foreground";
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  <label class={labelClass}>
    <span class={labelTextClass}>Locale preset</span>
    <Select.Root
      type="single"
      value={currentLocaleId}
      onValueChange={(v) => {
        const l = LOCALES.find((x) => x.id === v);
        if (!l) return;
        sequence.updateStepConfig<MetaConfig>(id, {
          language: l.language, keyboard: l.keyboard,
          systemLocale: l.systemLocale, userLocale: l.userLocale,
          timezone: l.timezone, geoId: l.geoId,
        });
      }}
    >
      <Select.Trigger><span>{currentLocale.label}</span></Select.Trigger>
      <Select.Content>
        {#each LOCALES as l (l.id)}
          <Select.Item value={l.id} label={l.label}>
            <div class="flex flex-col">
              <span>{l.label}</span>
              <span class="text-[11px] text-muted-foreground">{l.language} · {l.timezone}</span>
            </div>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <span class="text-[11px] text-muted-foreground">
      → {currentLocale.language} · {currentLocale.timezone} · GeoID {currentLocale.geoId}
    </span>
  </label>
  <div></div>

  <label class={labelClass}>
    <span class={labelTextClass}>Local username</span>
    <input type="text" class={fieldClass} value={config.username}
      oninput={(e) => sequence.updateStepConfig<MetaConfig>(id, { username: (e.currentTarget as HTMLInputElement).value })} />
  </label>
  <label class={labelClass}>
    <span class={labelTextClass}>Password (recommended for fully-unattended mode)</span>
    <input type="text" class={fieldClass} value={config.password} placeholder="Empty = Setup shows account screen"
      oninput={(e) => sequence.updateStepConfig<MetaConfig>(id, { password: (e.currentTarget as HTMLInputElement).value })} />
  </label>

  <label class={labelClass}>
    <span class={labelTextClass}>Computer name</span>
    <input type="text" class={fieldClass} value={config.computerName}
      oninput={(e) => sequence.updateStepConfig<MetaConfig>(id, { computerName: (e.currentTarget as HTMLInputElement).value })} />
  </label>
  <label class={labelClass}>
    <span class={labelTextClass}>Organization</span>
    <input type="text" class={fieldClass} value={config.organization}
      oninput={(e) => sequence.updateStepConfig<MetaConfig>(id, { organization: (e.currentTarget as HTMLInputElement).value })} />
  </label>

  <div class="md:col-span-2 flex items-center justify-between px-3 py-2.5 rounded-md bg-foreground/[0.03] border border-foreground/8">
    <div class="flex items-center gap-2">
      <UserCircle2 class="size-4 text-muted-foreground" />
      <div>
        <div class="text-sm font-medium">Auto-logon on first boot</div>
        <div class="text-xs text-muted-foreground">Requires a non-empty password.</div>
      </div>
    </div>
    <Switch checked={config.autologon}
      onCheckedChange={(v) => sequence.updateStepConfig<MetaConfig>(id, { autologon: v })} />
  </div>
</div>
