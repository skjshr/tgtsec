import { getRuntime } from "../cloud/runtime.mjs";

export default {
  fetch(request) {
    return getRuntime().fetch(request);
  },
};
