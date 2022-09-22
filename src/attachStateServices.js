import { services } from "@statewalker/services";

export default function attachStateServices(servicesInstance = services) {
  return (state) => {
    state.process.services = state.process.services || servicesInstance;
    state.service = (key, service) => {
      let provider;
      state.init(
        () => (provider = state.process.services.newProvider(key, service))
      );
      state.done(() => provider && provider.close());
    };
    state.useServices = (key, action) => {
      let consumer;
      state.init(
        () => (consumer = state.process.services.newConsumer(key, action))
      );
      state.done(() => consumer && consumer.close());
    };

  };
}