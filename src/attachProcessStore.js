import { newStore, extendStore, observeStore } from "@statewalker/store";
import { useProcess, onActivate, onDeactivate, useDispatch } from "@statewalker/fsm-process/hooks";

export function initStore(options) {
  return (process) => {
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
}


function _useProcessWithStore(action) {
  return useProcess((process, ...args) => {
    if (!process.store) throw new Error("Process store is not initialized. Use the 'initStore' method to bind a store to the process.");
    return action(process, ...args);
  })
}

export function useStore() {
  return _useProcessWithStore(process => process.store);
}

export function useData(field) {
  return _useProcessWithStore(process => [() => process.getData(field), (value) => process.setData(field, value)]);
}

export function useDataIterator(field, defaultTransform = v => v) {
  let stop, terminated = false;
  onDeactivate(() => (stop && stop(), terminated = true));
  return _useProcessWithStore(process => async function* (transform = defaultTransform) {
    if (terminated) return;
    const iterator = observeStore(process.store, field, (s) => terminated ? s() : stop = s);
    for await (const value of iterator) {
      yield await transform(value);
    }
  })
}

export function withData(field, action) {
  let cleanup;
  const process = _useProcessWithStore(process => process);
  onActivate(() => {
    let prev;
    let use = Array.isArray(field) ? process.store.useAll : process.store.use;
    cleanup = use(field, (value) => {
      action(value, prev);
      prev = value;
    });
  });
  onDeactivate(() => cleanup && cleanup());
  return () => cleanup && cleanup();
}

function _useEventDispatch() {
  const store = useStore();
  const dispatch = useDispatch();
  return (event) => {
    if (!event) return false;
    let key, data;
    if (typeof event === "string") key = event;
    else if (Array.isArray(event)) [key, data] = event;
    else ({ key, data } = event);
    if (!key) return false;
    if (data) store.setAll(data);
    if (key) dispatch(key);
    return !!key;
  }
}

export function useTimeout(delay, action = () => ({ key: "ok" })) {
  const dispatchEvent = _useEventDispatch();
  const process = useProcess();
  const { startTimer = setTimeout, stopTimer = clearTimeout } = process.timerOptions || {};
  let id;
  const cleanup = () => (id && stopTimer(id), id = null);
  onActivate(() => (id = startTimer(() => dispatchEvent(action()), delay)));
  onDeactivate(cleanup);
  return cleanup;
}

export function useTrigger(field, action) {
  const dispatchEvent = _useEventDispatch();
  return withData(field, (value, prev) => dispatchEvent(action(value, prev)));
}

export function attachProcessStore(options = {}) {

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