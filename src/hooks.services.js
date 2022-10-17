import { useInit, useDone, useProcess } from "@statewalker/fsm-process";
import { services as servicesInstance } from "@statewalker/services";

export function initServices(options = {}) {
  return (process) => {
    process.services = options.services || servicesInstance;
    process.provideService = (key, service) => process.services.newProvider(key, service).close;
    process.consumeServices = (key, consumer) => process.services.newConsumer(key, consumer).close;
  }
}

function useProcessWithServices() {
  const process = useProcess();
  if (!process.services) throw new Error(`Process services are not defined. Use the "initServices" method to initialize the process.`);
  return process;
}

export function provideService(serviceKey, service) {
  const process = useProcessWithServices();
  let close;
  useInit(() => close = process.provideService(serviceKey, service));
  useDone(() => close && close());
}

export function consumeServices(serviceKey, consumer) {
  const process = useProcessWithServices();
  let close;
  useInit(() => close = process.consumeServices(serviceKey, consumer));
  useDone(() => close && close());
}
