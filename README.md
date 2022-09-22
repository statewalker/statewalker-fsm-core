# @statewalker/fsm-core: Core Library

This module contains functions core utility methods injected in FSM process states.
These methods allow to:
* set/get/use data in a store associated with the process
* declare triggers generating transition events when data changes in the store
* declare timers associated with states
* declare/use services

The timelife of services, triggers, timers and data subscriptions are bound to to the state initialization/destruction cycles.
It means that a service, trigger or a data subscription became active when the corresponding state is initialized and they are automatically deactivated when the FSM leaves and deactivates the state.

