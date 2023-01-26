import * as core from '@actions/core';
import { run } from './action';


async function main(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    if (error instanceof Error) core.setFailed(error.message);
    else core.setFailed(`${error}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
