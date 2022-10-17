import expect from 'expect.js';
import { initAsyncProcess, combineHandlers, newStateHandler } from '@statewalker/fsm-process';
import { initPrinter, usePrinter }  from '@statewalker/fsm-process/hooks.printer';
import config from "./productCatalogStatechart.js";
import { attachProcessStore, useStore } from "../src/attachProcessStore.js"

describe('attachProcessStore', () => {

  function newPrintChecker() {
    const lines = [];
    return [lines, (...control) => expect(lines.map(items => items.join(''))).to.eql(control)];
  }

  it(`should attach the 'store' field and 'getData', 'setData','useData', 'observeData', 'trigger' and 'timeout' methods to states`, async () => {
    const handler = combineHandlers(
      attachProcessStore(),
      ({ store, useData, setData, getData, observeData, trigger, timeout }) => {
        // Fields
        expect(typeof store).to.be("function");
        // Methods
        expect(typeof setData).to.be("function");
        expect(typeof getData).to.be("function");
        expect(typeof useData).to.be("function");
        expect(typeof observeData).to.be("function");
        // Event triggers
        expect(typeof trigger).to.be("function");
        expect(typeof timeout).to.be("function");
      }
    );
    let error;
    const process = initAsyncProcess({ config, handler, handleError: (e) => error = e });
    await process.next({ key: "start" });
    if (error) throw error;
  })

  it(`should define setData/ useData`, async () => {
    const [lines, checkLines] = newPrintChecker();

    let error;
    const process = initAsyncProcess({
      config,
      initialize : combineHandlers(
        initPrinter({ print: (...args) => lines.push(args) }),
      ),
      handler : combineHandlers(
        attachProcessStore(),
        ({ key, init, done }) => {
          const print = usePrinter();
          init(() => print('-> ', key));
          done(() => print('<- ', key));
        },
        newStateHandler({
          "App": ({ init, setData }) => {
            init(() => {
              setData("message", "Hello Application!")
            });
          },
          "ProductList": ({ useData }) => {
            const print = usePrinter();
            useData(["message"], ({ message }) => {
              print(" * [ProductList]: ", message);
            })
          },
  
          "ProductBasket": ({ setData }) => {
            setData("message", "Hello from ProductBasket!")
          },
  
          "HandleBasketUpdate": ({ useData }) => {
            const print = usePrinter();
            useData(["message"], ({ message }) => {
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
    const [lines, checkLines] = newPrintChecker();

    let error;
    const process = initAsyncProcess({
      config,
      initialize : combineHandlers(
        initPrinter({ print: (...args) => lines.push(args) }),
      ),
      handler : combineHandlers(
        attachProcessStore(),
        ({ key, init, done }) => {
          const print = usePrinter();
          init(() => print('-> ', key));
          done(() => print('<- ', key));
        },
        newStateHandler({
          "App": ({ init, trigger, setData }) => {
            setData("submit", 1);
  
            // This trigger listens the "submit" store field
            // and generates the "addToBasket" event when  
            // submit counter changes its value.
            trigger(["submit"], (d, prev) => {
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
    process.store.set("submit", 2);
    expect(process.running !== prevRunningPromise).to.be(true);
    await process.running;
    expect(process.running).to.be(undefined);

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
    process.store.set("submit", 2);
    expect(process.running).to.be(undefined);


  })


  it(`observeData should provide value iterator with the life cycle attached to the state`, async () => {
    const [lines, checkLines] = newPrintChecker();

    let error;
    const process = initAsyncProcess({
      config,
      initialize : combineHandlers(
        initPrinter({ print: (...args) => lines.push(args) })
      ),
      handler : combineHandlers(
        attachProcessStore(),
        ({ key, init, done }) => {
          const print = usePrinter();
          init(() => print('-> ', key));
          done(() => print('<- ', key));
        },
        newStateHandler({
          "ProductList": ({ init, observeData }) => {
            const print = usePrinter();
            init(() => {
              // Start a new async process, detached from the state init/done cycle
              (async () => {
                for await (const message of observeData("message")) {
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
      '      * [ProductList]:'
    );
    for (let i = 0; i < 10; i++) {
      process.setData("message", "Hello - " + i);
      await new Promise(y => setTimeout(y, 10));
    }
    await process.next({ key: "addToBasket" });
    if (error) throw error;

    checkLines(
      '-> App',
      '  -> ProductCatalog',
      '    -> ProductList',
      '      * [ProductList]:',
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
