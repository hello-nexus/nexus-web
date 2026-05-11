// Razer WebHID vendor module. Importing this file registers Razer with the
// vendor-agnostic WebHID peripheral registry; the hook + UI use it without
// knowing Razer specifically.
import { registerWebHidVendor } from '../peripheral';
import { RAZER_SPEC } from './spec';
import { WebHidRazerMouse } from './mouse';

registerWebHidVendor({
  vendorId: RAZER_SPEC.vendorId,
  displayName: 'Razer',
  wrap: (device) => WebHidRazerMouse.tryWrap(device),
});

export { WebHidRazerMouse } from './mouse';
export { RAZER_SPEC, getProfile } from './spec';
