import { format } from 'node:util';
import {
  test as nodeTest,
  type TestContext,
  type TestOptions,
} from 'node:test';

type TestBody = (context: TestContext) => unknown;

function registerEach(cases: readonly unknown[]) {
  return (title: string, body: (...args: never[]) => unknown) => {
    for (const entry of cases) {
      const args = (Array.isArray(entry) ? entry : [entry]) as never[];
      const bodyWithContext = body as (
        ...values: never[]
      ) => unknown;
      nodeTest(format(title, ...args), () => bodyWithContext(...args));
    }
  };
}

function registerTest(
  title: string,
  optionsOrBody: TestOptions | TestBody,
  body?: TestBody,
) {
  if (typeof optionsOrBody === 'function') {
    return nodeTest(title, optionsOrBody);
  }
  if (body === undefined) {
    throw new TypeError('test body is required');
  }
  return nodeTest(title, optionsOrBody, body);
}

export const test = Object.assign(
  registerTest,
  {
    each: registerEach,
  },
);
