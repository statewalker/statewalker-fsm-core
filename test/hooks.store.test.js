import { describe, it, expect } from "./deps.js";
import { initAsyncProcess, combineHandlers, newStateHandler } from '@statewalker/fsm-process';
import { initPrinter, usePrinter } from '@statewalker/fsm-process';
import { useStateKey, onActivate, onDeactivate } from '@statewalker/fsm-process';
import config from "./productCatalogStatechart.js";
import { initStore, useStore, useData, withData, useDataIterator, useTimeout, useTrigger } from "../src/hooks.store.js"

describe('hookds.store.js', () => {

  function newPrintChecker() {
    const lines = [];
    return [(...args) => lines.push(args), (...control) => expect(lines.map(items => items.join(''))).toEqual(control)];
  }

  it(`should throw an error if  the 'store' field and 'getData', 'setData','useData', 'observeData', 'trigger' and 'timeout' methods to states`, async () => {
    let error;
    const process = initAsyncProcess({
      config,
      handler: () => {
        useStore();
      },
      handleError: (e) => error = e
    });
    await process.next({ key: "start" });
    expect(error instanceof Error).toBe(true);
  })

  async function checkStoreMethod(handler) {
    let error;
    const process = initAsyncProcess({
      config,
      initialize: combineHandlers(
        initStore()
      ),
      handler,
      handleError: (e) => error = e
    });
    await process.next({ key: "start" });
    if (error) throw error;
  }

  it(`useStore: should return an activated store instance`, async () => {
    await checkStoreMethod(() => {
      const store = useStore();
      expect(typeof store).toBe('function');
    })
  })
  it(`useData: should return [getData, setData] methods`, async () => {
    await checkStoreMethod(() => {
      const [getData, setData] = useData("abc");
      expect(typeof getData).toBe('function');
      expect(typeof setData).toBe('function');
    })
  })
  it(`useDataIterator: should return an async generator`, async () => {
    await checkStoreMethod(() => {
      const gen = useDataIterator("abc");
      expect(typeof gen).toBe("function");
    })
  })
  it(`withData: should a function handling properties changes`, async () => {
    let counter = 0;
    const values = [];
    await checkStoreMethod(() => {
      const stateKey = useStateKey();
      withData("abc", (value) => {
        values.push({ value, stateKey, counter: counter++ });
      })
      const store = useStore();
      store.set("abc", 'hello');
    })
    expect(values).toEqual([
      { value: 'hello', stateKey: 'App', counter: 0 },
      { value: 'hello', stateKey: 'ProductCatalog', counter: 1 },
      { value: 'hello', stateKey: 'ProductList', counter: 2 }
    ])
  })
  it(`useTimeout: should return a function generating new events at the end of the specified period`, async () => {
    await checkStoreMethod(() => {
      const cleanup = useTimeout(10);
      expect(typeof cleanup).toBe("function");
    })
  })
  it(`useTrigger: should be a function generating new events at the end of the specified period`, async () => {
    await checkStoreMethod(() => {
      const gen = useTrigger("abc", (data) => ({ key: "ok", data }));
      expect(typeof gen).toBe("function");
    })
  })

  it(`should define setData/ useData`, async () => {
    const [print, checkLines] = newPrintChecker();
    let error;
    const process = initAsyncProcess({
      config,
      initialize: combineHandlers(
        initPrinter({ print }),
        initStore()
      ),
      handler: combineHandlers(
        () => {
          const key = useStateKey();
          const print = usePrinter();
          onActivate(() => print('-> ', key));
          onDeactivate(() => print('<- ', key));
        },
        newStateHandler({
          "App": () => {
            const [, setMessage] = useData("message");
            onActivate(() => setMessage("Hello Application!"));
          },
          "ProductList": () => {
            const print = usePrinter();
            withData(["message"], ({ message }) => {
              print(" * [ProductList]: ", message);
            })
          },

          "ProductBasket": () => {
            const [, setMessage] = useData("message");
            setMessage("Hello from ProductBasket!")
          },

          "HandleBasketUpdate": () => {
            const print = usePrinter();
            withData(["message"], ({ message }) => {
              print(" * [HandleBasketUpdate]: ", message);
            })
          },
        })
      ),
      handleError: (e) => error = e
    });
    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '     * [ProductList]: Hello Application!'
    );

    await process.next({ key: "addToBasket" });
    if (error) throw error;
    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '     * [ProductList]: Hello Application!',
      '    <- ProductList',
      '  <- ProductCatalog',
      '  -> ProductBasket',
      '    -> HandleBasketUpdate',
      '     * [HandleBasketUpdate]: Hello from ProductBasket!'
    );

  })

  it(`trigger method should generate new events when the associated data are changed`, async () => {
    const [printLines, checkLines] = newPrintChecker();
    let error;
    const process = initAsyncProcess({
      config,
      initialize: combineHandlers(
        initPrinter({ print: printLines }),
        initStore()
      ),
      handler: combineHandlers(
        () => {
          const key = useStateKey();
          const print = usePrinter();
          onActivate(() => print('-> ', key));
          onDeactivate(() => print('<- ', key));
        },
        newStateHandler({
          "App": () => {
            const [, setSubmitCounter] = useData("submit");
            setSubmitCounter(1);

            // This trigger listens the "submit" store field
            // and generates the "addToBasket" event when  
            // submit counter changes its value.
            useTrigger(["submit"], (d, prev) => {
              // Don't activate the event if this is the first call for the trigger
              // or the value was not changed since the last call
              if (!prev || (prev.submit === d.submit)) return;
              return { key: "addToBasket" };
            })
          },
        })
      ),
      handleError: (e) => error = e
    });
    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
    );

    const prevRunningPromise = process.running;
    // Updates the "submit" field. It should generate a new event
    process.setData("submit", 2);
    expect(process.running !== prevRunningPromise).toBe(true);
    await process.running;
    expect(process.running).toBe(undefined);

    if (error) throw error;
    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '    <- ProductList',
      '  <- ProductCatalog',
      '  -> ProductBasket',
      '    -> HandleBasketUpdate',
    );

    // The submit value was not changed:
    process.setData("submit", 2);
    expect(process.running).toBe(undefined);
  })

  it(`observeData should provide value iterator with the life cycle attached to the state`, async () => {
    const [printLines, checkLines] = newPrintChecker();

    let error;
    const process = initAsyncProcess({
      config,
      initialize: combineHandlers(
        initPrinter({ print: printLines }),
        initStore()
      ),
      handler: combineHandlers(
        () => {
          const key = useStateKey();
          const print = usePrinter();
          onActivate(() => print('-> ', key));
          onDeactivate(() => print('<- ', key));
        },
        newStateHandler({
          "App": () => {
            const [, setMessage] = useData("message");
            onActivate(() => setMessage(" initial message"))
          },
          "ProductList": () => {
            const print = usePrinter();
            const getMessages = useDataIterator("message");
            onActivate(() => {
              // Start a new async process, detached from the state init/done cycle
              (async () => {
                print("* [ProductList]: Start Iterations.");
                for await (const message of getMessages()) {
                  print("* [ProductList]:", message);
                }
                print("* [ProductList]: Iteration Finished.");
              })();
            })
          },

        })
      ),
      handleError: (e) => error = e
    });
    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '    * [ProductList]: Start Iterations.',
      '    * [ProductList]: initial message',
    );
    const [, setMessage] = process.useData("message");
    for (let i = 0; i < 10; i++) {
      setMessage("Hello - " + i);
      await new Promise(y => setTimeout(y, 10));
    }
    await process.next({ key: "addToBasket" });
    if (error) throw error;

    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '    * [ProductList]: Start Iterations.',
      '    * [ProductList]: initial message',
      '    * [ProductList]:Hello - 0',
      '    * [ProductList]:Hello - 1',
      '    * [ProductList]:Hello - 2',
      '    * [ProductList]:Hello - 3',
      '    * [ProductList]:Hello - 4',
      '    * [ProductList]:Hello - 5',
      '    * [ProductList]:Hello - 6',
      '    * [ProductList]:Hello - 7',
      '    * [ProductList]:Hello - 8',
      '    * [ProductList]:Hello - 9',
      '    <- ProductList',
      '  <- ProductCatalog',
      '  * [ProductList]: Iteration Finished.',
      '  -> ProductBasket',
      '    -> HandleBasketUpdate'
    );

  })


});
