import { newStore, extendStore, observeStore } from "@statewalker/store";

export default function attachProcessStore(options = {}) {

  const startTimer = options.setTimeout || setTimeout;
  const stopTimer = options.clearTimeout || clearTimeout;

  return (state) => {
    const process = state.process;

    if (!process.store) {
      process.store = extendStore(options.store || newStore())

      process.setData = (field, value) => {
        return Array.isArray(field)
          ? process.store.setAll(field, value)
          : (typeof field === 'object')
            ? process.store.setAll(field)
            : process.store.set(field, value);
      }

      process.getData = (field) => {
        return Array.isArray(field)
          ? process.store.getAll(field)
          : process.store.get(field);
      }
    }

    state.store = process.store;
    state.getData = process.getData;
    state.setData = process.setData;
    state.observeData = (field) => {
      let stop, terminated = false;
      state.done(() => (stop && stop(), terminated = true));
      return observeStore(state.store, field, (s) => terminated ? s() : stop = s);
    }

    state.useData = (field, action) => {
      let cleanup;
      state.init(() => {
        let prev;
        let use = Array.isArray(field) ? process.store.useAll : process.store.use;
        cleanup = use(field, (value) => {
          action(value, prev);
          prev = value;
        });
      });
      state.done(() => cleanup && cleanup());
    }

    function _dispatchEvent(event) {
      if (!event) return false;
      let key, data;
      if (typeof event === "string") key = event;
      else if (Array.isArray(event)) [key, data] = event;
      else ({ key, data } = event);
      if (!key) return false;
      if (data) state.store.setAll(data);
      if (key) state.dispatch(key);
      return !!key;
    }

    state.timeout = (delay, action = () => ({ key: "ok" })) => {
      let id;
      state.init(() => (id = startTimer(() => _dispatchEvent(action()), delay)));
      state.done(() => stopTimer(id));
    }

    state.trigger = (field, action) => {
      state.useData(field, (value, prev) => _dispatchEvent(action(value, prev)));
    }
  };
}