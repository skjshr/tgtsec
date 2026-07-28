import { getRuntime } from "../apps/lab-guide/cloud/runtime.mjs";

export default {
  fetch(request) {
    return getRuntime().fetch(request);
  },
};
