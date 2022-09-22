import expect from 'expect.js';
import { initAsyncProcess, combineHandlers, attachStatePrinter, newStateHandler } from '@statewalker/fsm-process';
import config from "./productCatalogStatechart.js";
import attachProcessStore from "../src/attachProcessStore.js"

describe('attachProcessStore', () => {

  function newPrintChecker() {
    const lines = [];
    return [lines, (...control) => expect(lines.map(items => items.join(''))).to.eql(control)];
  }

  it(`should attach the 'store' field and 'getData', 'setData','useData', 'trigger' and 'timeout' methods to states`, async () => {
    const handler = combineHandlers(
      attachProcessStore(),
      ({ store, useData, setData, getData, trigger, timeout }) => {
        // Fields
        expect(typeof store).to.be("function");
        // Methods
        expect(typeof setData).to.be("function");
        expect(typeof getData).to.be("function");
        expect(typeof useData).to.be("function");
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

    const handler = combineHandlers(
      attachStatePrinter({ print: (...args) => lines.push(args) }),
      attachProcessStore(),
      ({ key, init, done, print }) => {
        init(() => print('-> ', key));
        done(() => print('<- ', key));
      },
      newStateHandler({
        "App": ({ init, setData }) => {
          init(() => {
            setData("message", "Hello Application!")
          });
        },
        "ProductList": ({ useData, print }) => {
          useData(["message"], ({ message }) => {
            print(" * [ProductList]: ", message);
          })
        },

        "ProductBasket": ({ setData }) => {
          setData("message", "Hello from ProductBasket!")
        },

        "HandleBasketUpdate": ({ useData, print }) => {
          useData(["message"], ({ message }) => {
            print(" * [HandleBasketUpdate]: ", message);
          })
        },


      })
    );
    let error;
    const process = initAsyncProcess({ config, handler, handleError: (e) => error = e });
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

    const handler = combineHandlers(
      attachStatePrinter({ print: (...args) => lines.push(args) }),
      attachProcessStore(),
      ({ key, init, done, print }) => {
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
            if (!prev || (prev.submit === d.submit)) return ; 
            return { key : "addToBasket" };
          })
        },
      })
    );
    let error;
    const process = initAsyncProcess({ config, handler, handleError: (e) => error = e });
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


});
