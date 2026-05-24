import { Select as SelectPrimitive } from "bits-ui";

import Trigger from "./trigger.svelte";
import Content from "./content.svelte";
import Item from "./item.svelte";
import Label from "./label.svelte";

const Root = SelectPrimitive.Root;
const Group = SelectPrimitive.Group;
const Portal = SelectPrimitive.Portal;

export {
  Root,
  Group,
  Portal,
  Trigger,
  Content,
  Item,
  Label,
  //
  Root as SelectRoot,
  Group as SelectGroup,
  Portal as SelectPortal,
  Trigger as SelectTrigger,
  Content as SelectContent,
  Item as SelectItem,
  Label as SelectLabel,
};
