import { describe, it, expect } from "./deps.js";
import { initAsyncProcess, combineHandlers, newStateHandler } from '@statewalker/fsm-process';
import { initPrinter, usePrinter } from '@statewalker/fsm-process';
import config from "./productCatalogStatechart.js";
import { useEventKey, onActivate, useStateKey, useEvent } from '@statewalker/fsm-process';
import { consumeServices, initServices, provideService } from '../src/hooks.services.js';

describe('hooks.services.js', () => {

  function newPrintChecker() {
    const lines = [];
    return [lines, (...control) => expect(lines.map(items => items.join(''))).toEqual(control)];
  }

  it(`should attach service/use services methods to states`, async () => {
    const [lines, checkLines] = newPrintChecker();

    let error;
    const process = initAsyncProcess({
      config,
      initialize: combineHandlers(
        initPrinter({ print: (...args) => lines.push(args) }),
        initServices()
      ),
      handler: combineHandlers(
        () => {
          const key = useStateKey();
          const print = usePrinter();
          onActivate(() => print(`* ${key}: start`))
        },
        newStateHandler({
          App: () => {
            const print = usePrinter();
            consumeServices("test", (list) => print(`* App: Services: [${list.join("; ")}]`))
          },
          ProductList: () => {
            provideService("test", "This is a ProductList service");
          }
        })
      ),
      handleError: (e) => error = e
    });

    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '* App: start',
      "* App: Services: []",
      '  * ProductCatalog: start',
      '    * ProductList: start',
      "    * App: Services: [This is a ProductList service]"
    )

  })

  it(`should be able to declare, use and destroy services associated with states`, async () => {
    const [lines, checkLines] = newPrintChecker();
    const publishedServices = [];

    function provideViewService(service) {
      return provideService("view", service);
    }
    function consumeViewServices(consumer) {
      return consumeServices("view", consumer);
    }

    let error;
    const process = initAsyncProcess({
      config,
      initialize: [
        initPrinter({ print: (...args) => lines.push(args) }),
        initServices()
      ],
      handler: [
        () => {
          const key = useStateKey();
          const getEventKey = useEventKey();
          const print = usePrinter();
          onActivate(() => print('* ', key, ': ', getEventKey()))
        },
        {
          App: () => {
            consumeViewServices((list) => publishedServices.push(list))
          },
          ProductCatalog: () => {
            provideViewService("ui:ProductCatalog")
          },
          ProductView: () => {
            provideViewService("ui:ProductView")
          },
          ProductBasket: () => {
            provideViewService("ui:ProductBasket")
          }
        }
      ],
      handleError: (e) => error = e
    });

    expect(publishedServices).toEqual([]);

    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '* App: start',
      '  * ProductCatalog: start',
      '    * ProductList: start'
    )

    expect(publishedServices).toEqual([
      [],
      ["ui:ProductCatalog"]
    ]);

    // 
    await process.next({ key: "showDetails" });
    if (error) throw error;
    checkLines(
      '* App: start',
      '  * ProductCatalog: start',
      '    * ProductList: start',
      '    * ProductView: showDetails'
    )
    expect(publishedServices).toEqual([
      [],
      ["ui:ProductCatalog"],
      ['ui:ProductCatalog', 'ui:ProductView']
    ]);

    // 
    await process.next({ key: "addToBasket" })
    if (error) throw error;
    checkLines(
      '* App: start',
      '  * ProductCatalog: start',
      '    * ProductList: start',
      '    * ProductView: showDetails',
      '  * ProductBasket: addToBasket',
      '    * HandleBasketUpdate: addToBasket'
    )
    expect(publishedServices).toEqual([
      [],
      ['ui:ProductCatalog'],
      ['ui:ProductCatalog', 'ui:ProductView'],
      ['ui:ProductCatalog'],
      [],
      ['ui:ProductBasket'],
    ]);

  })

});
