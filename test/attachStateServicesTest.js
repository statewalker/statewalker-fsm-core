import expect from 'expect.js';
import { initAsyncProcess, combineHandlers, attachStatePrinter, newStateHandler } from '@statewalker/fsm-process';
import config from "./productCatalogStatechart.js";
import attachStateServices from "../src/attachStateServices.js"
import { services } from '@statewalker/services';

describe('attachStateServices', () => {

  function newPrintChecker() {
    const lines = [];
    return [lines, (...control) => expect(lines.map(items => items.join(''))).to.eql(control)];
  }

  it(`should attach service/useServices methods to states`, async () => {
    const [lines, checkLines] = newPrintChecker();

    const handler = combineHandlers(
      attachStatePrinter({ print: (...args) => lines.push(args) }),
      attachStateServices(),
      ({ key, init, getEventKey, service, useServices, print }) => {
        expect(typeof service).to.be("function");
        expect(typeof useServices).to.be("function");
        init(() => print('* ', key, ': ', getEventKey()))
      }
    );
    let error;
    const process = initAsyncProcess({ config, handler, handleError: (e) => error = e });

    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '* App: start',
      '  * ProductCatalog: start',
      '    * ProductList: start'
    )

  })

  it(`should be able to declare, use and destroy services associated with states`, async () => {
    const [lines, checkLines] = newPrintChecker();
    const publishedServices = [];

    const handler = combineHandlers(
      attachStatePrinter({ print: (...args) => lines.push(args) }),
      attachStateServices(),
      ({ key, init, getEventKey, service, useServices, print }) => {
        expect(typeof service).to.be("function");
        expect(typeof useServices).to.be("function");
        init(() => print('* ', key, ': ', getEventKey()))
      },
      newStateHandler({
        App: ({ useServices }) => {
          useServices("view", (list) => publishedServices.push(list))
        },
        ProductCatalog: ({ service }) => {
          service("view", "ui:ProductCatalog")
        },
        ProductView: ({ service }) => {
          service("view", "ui:ProductView")
        },
        ProductBasket : ({ service }) => {
          service("view", "ui:ProductBasket")
        }
      })
    );
    let error;
    const process = initAsyncProcess({ config, handler, handleError: (e) => error = e });

    expect(publishedServices).to.eql([]);

    await process.next({ key: "start" });
    if (error) throw error;
    checkLines(
      '* App: start',
      '  * ProductCatalog: start',
      '    * ProductList: start'
    )

    expect(publishedServices).to.eql([
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
    expect(publishedServices).to.eql([
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
    expect(publishedServices).to.eql([
      [],
      ['ui:ProductCatalog'],
      ['ui:ProductCatalog', 'ui:ProductView'],
      ['ui:ProductCatalog'],
      [],
      ['ui:ProductBasket'],
    ]);

  })

});
