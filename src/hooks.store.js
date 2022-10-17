import { newStore, extendStore, observeStore } from "@statewalker/store";
import { useProcess, useInit, useDone, useDispatch } from "@statewalker/fsm-process";

export function initStore(options = {}) {
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

    process.useData = (field) => {
      return [() => process.getData(field), (value) => process.setData(field, value)]
    }
  }
}

function _useProcessWithStore() {
  const process = useProcess();
  if (!process.store) throw new Error("Process store is not initialized. Use the 'initStore' method to bind a store to the process.");
  return process;
}

export function useStore() {
  const process = _useProcessWithStore();
  return process.store;
}

export function useData(field) {
  const process = _useProcessWithStore();
  return process.useData(field);
}

export function useDataIterator(field, defaultTransform = v => v) {
  let stop, terminated = false;
  useDone(() => (stop && stop(), terminated = true));
  const process = _useProcessWithStore();
  return async function* (transform = defaultTransform) {
    if (terminated) return;
    const iterator = observeStore(process.store, field, (s) => terminated ? s() : stop = s);
    for await (const value of iterator) {
      yield await transform(value);
    }
  }
}

export function withData(field, action) {
  let cleanup;
  const process = _useProcessWithStore();
  useInit(() => {
    let prev;
    let use = Array.isArray(field) ? process.store.useAll : process.store.use;
    cleanup = use(field, (value) => {
      action(value, prev);
      prev = value;
    });
  });
  useDone(() => cleanup && cleanup());
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

export function useTrigger(field, action) {
  const dispatchEvent = _useEventDispatch();
  return withData(field, (value, prev) => dispatchEvent(action(value, prev)));
}

export function initTimer(options = {}) {
  return (process) => process.timerOptions = options;
}
export function useTimeout(delay, action = () => ({ key: "ok" })) {
  const dispatchEvent = _useEventDispatch();
  const process = useProcess();
  const { startTimer = setTimeout, stopTimer = clearTimeout } = process.timerOptions || {};
  let id;
  const cleanup = () => (id && stopTimer(id), id = null);
  useInit(() => (id = startTimer(() => dispatchEvent(action()), delay)));
  useDone(cleanup);
  return cleanup;
}

